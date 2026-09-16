namespace Goo.Gslint;

public static partial class Program
{
    private static string FixSource(SyntaxTree tree, string source)
    {
        var rewritten = RewriteSource(tree, source);
        return GSharpFormatter.Format(SourceText.From(rewritten)).Text?.ToString() ?? source;
    }

    private static string ReduceSource(string source, string file)
    {
        for (var pass = 0; pass < 4; pass++)
        {
            var tree = SyntaxTree.Parse(SourceText.From(source, file));
            if (tree.Diagnostics.Any(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error))
            {
                return source;
            }

            var rewritten = RewriteSource(tree, source);
            if (rewritten == source)
            {
                break;
            }

            source = rewritten;
        }

        return source;
    }

    private static string RewriteSource(SyntaxTree tree, string source)
    {
        var edits = new List<SourceEdit>();
        CollectFixEdits(tree.Root, source, edits);
        CollectConditionalReturnEdits(tree.Root, source, edits);
        CollectDefaultAssignmentEdits(tree.Root, source, edits);

        var varFindings = new List<Finding>();
        AddVarFindings(tree.Root, true, varFindings);
        foreach (var finding in varFindings.Where(finding => finding.Rule == VarRule))
        {
            var keywordEnd = finding.Location.Span.Start;
            while (keywordEnd > 0 && char.IsWhiteSpace(source[keywordEnd - 1]))
            {
                keywordEnd--;
            }

            var keywordStart = keywordEnd - 3;
            if (keywordStart >= 0 && source.AsSpan(keywordStart, 3).SequenceEqual("var"))
            {
                edits.Add(new SourceEdit(keywordStart, 3, "let"));
            }
        }

        edits.Sort((left, right) => right.Start.CompareTo(left.Start));
        var rewritten = source;
        foreach (var edit in edits)
        {
            rewritten = rewritten.Remove(edit.Start, edit.Length).Insert(edit.Start, edit.Text);
        }

        return rewritten;
    }

    private static void CollectConditionalReturnEdits(SyntaxNode node, string source, List<SourceEdit> edits)
    {
        if (node is BlockStatementSyntax block)
        {
            for (var index = 0; index < block.Statements.Length; index++)
            {
                if (block.Statements[index] is not IfStatementSyntax { Initializer: null } conditional
                    || !TrySingleReturn(conditional.ThenStatement, out var whenTrue))
                {
                    continue;
                }

                if (conditional.ElseClause is { } clause
                    && TrySingleReturn(clause.ElseStatement, out var whenFalse))
                {
                    AddConditionalReturnEdit(
                        conditional.Span, conditional.Condition, whenTrue, whenFalse, source, edits);
                }
                else if (conditional.ElseClause is null
                    && index + 1 < block.Statements.Length
                    && block.Statements[index + 1] is ReturnStatementSyntax trailing
                    && trailing.Expression is { } trailingExpression
                    && !trailing.IsRefReturn)
                {
                    var span = TextSpan.FromBounds(conditional.Span.Start, trailing.Span.End);
                    AddConditionalReturnEdit(
                        span, conditional.Condition, whenTrue, trailingExpression, source, edits);
                    index++;
                }
            }
        }

        foreach (var child in node.GetChildren())
        {
            CollectConditionalReturnEdits(child, source, edits);
        }
    }

    private static bool TrySingleReturn(StatementSyntax statement, out ExpressionSyntax expression)
    {
        if (statement is BlockStatementSyntax { Statements.Length: 1 } block
            && block.Statements[0] is ReturnStatementSyntax { Expression: { } value, IsRefReturn: false })
        {
            expression = value;
            return true;
        }

        if (statement is ReturnStatementSyntax { Expression: { } direct, IsRefReturn: false })
        {
            expression = direct;
            return true;
        }

        expression = null!;
        return false;
    }

    private static void AddConditionalReturnEdit(
        TextSpan span,
        ExpressionSyntax condition,
        ExpressionSyntax whenTrue,
        ExpressionSyntax whenFalse,
        string source,
        List<SourceEdit> edits)
    {
        var original = source.Substring(span.Start, span.Length);
        if (original.Contains("//", StringComparison.Ordinal)
            || original.Contains("/*", StringComparison.Ordinal))
        {
            return;
        }

        var test = Source(condition);
        var success = Source(whenTrue);
        var failure = Source(whenFalse);
        if (TryBoolean(whenTrue, out var trueValue)
            && TryBoolean(whenFalse, out var falseValue)
            && trueValue != falseValue)
        {
            edits.Add(new SourceEdit(span.Start, span.Length,
                trueValue ? $"return {test}" : $"return !({test})"));
            return;
        }

        if (!IsSimpleConditional(test, success, failure))
        {
            return;
        }

        edits.Add(new SourceEdit(span.Start, span.Length,
            $"return if {test} {{ {success} }} else {{ {failure} }}"));

        string Source(SyntaxNode value) => source.Substring(value.Span.Start, value.Span.Length);
    }

    private static bool IsSimpleConditional(string condition, string whenTrue, string whenFalse)
    {
        var combinedLength = condition.Length + whenTrue.Length + whenFalse.Length;
        return combinedLength <= 120
            && !ContainsLineBreak(condition)
            && !ContainsLineBreak(whenTrue)
            && !ContainsLineBreak(whenFalse)
            && !condition.Contains("nil", StringComparison.Ordinal)
            && !condition.Contains(" is ", StringComparison.Ordinal)
            && !condition.Contains("let ", StringComparison.Ordinal)
            && IsSimpleValue(whenTrue)
            && IsSimpleValue(whenFalse);
    }

    private static bool IsSimpleValue(string value) =>
        !value.Contains('{')
        && !value.Contains('}')
        && !value.StartsWith("if ", StringComparison.Ordinal)
        && !value.StartsWith("switch ", StringComparison.Ordinal);

    private static bool ContainsLineBreak(string value) => value.Contains('\r') || value.Contains('\n');

    private static bool TryBoolean(ExpressionSyntax expression, out bool value)
    {
        if (expression is LiteralExpressionSyntax { Value: bool literal })
        {
            value = literal;
            return true;
        }

        value = false;
        return false;
    }

    private static void CollectDefaultAssignmentEdits(SyntaxNode node, string source, List<SourceEdit> edits)
    {
        if (node is StructDeclarationSyntax declaration)
        {
            var fields = declaration.Fields
                .Where(field => field.Initializer is null && field.VarOrLetKeyword?.Kind == SyntaxKind.VarKeyword)
                .ToDictionary(field => field.Identifier.Text, StringComparer.Ordinal);
            foreach (var constructor in declaration.Constructors)
            {
                var parameters = constructor.Parameters
                    .Select(parameter => parameter.Identifier.Text)
                    .ToHashSet(StringComparer.Ordinal);
                var redundant = constructor.Body.Statements
                    .Where(statement => IsRedundantDefaultAssignment(statement, fields, parameters))
                    .ToList();
                if (redundant.Count == 0)
                {
                    continue;
                }

                if (redundant.Count == constructor.Body.Statements.Length)
                {
                    edits.Add(new SourceEdit(constructor.Body.Span.Start, constructor.Body.Span.Length, "{ }"));
                    continue;
                }

                foreach (var statement in redundant)
                {
                    edits.Add(WholeLineEdit(statement.Span, source));
                }
            }
        }

        foreach (var child in node.GetChildren())
        {
            CollectDefaultAssignmentEdits(child, source, edits);
        }
    }

    private static bool IsRedundantDefaultAssignment(
        StatementSyntax statement,
        IReadOnlyDictionary<string, FieldDeclarationSyntax> fields,
        IReadOnlySet<string> parameters)
    {
        if (statement is not ExpressionStatementSyntax
            {
                Expression: AssignmentExpressionSyntax assignment,
            }
            || parameters.Contains(assignment.IdentifierToken.Text)
            || !fields.TryGetValue(assignment.IdentifierToken.Text, out var field)
            || assignment.Expression is not LiteralExpressionSyntax literal)
        {
            return false;
        }

        if (literal.Value is null)
        {
            return field.Type.IsNullable;
        }

        if (literal.Value is bool boolean)
        {
            return !boolean && field.Type.Identifier?.Text == "bool";
        }

        if (!IsNumericZero(literal.Value))
        {
            return false;
        }

        return field.Type.Identifier?.Text is "int" or "int8" or "int16" or "int32" or "int64"
            or "uint" or "uint8" or "uint16" or "uint32" or "uint64"
            or "nint" or "nuint" or "float" or "float32" or "float64";
    }

    private static bool IsNumericZero(object value) => value switch
    {
        byte number => number == 0,
        sbyte number => number == 0,
        short number => number == 0,
        ushort number => number == 0,
        int number => number == 0,
        uint number => number == 0,
        long number => number == 0,
        ulong number => number == 0,
        float number => number == 0,
        double number => number == 0,
        decimal number => number == 0,
        _ => false,
    };

    private static SourceEdit WholeLineEdit(TextSpan span, string source)
    {
        var start = span.Start;
        while (start > 0 && source[start - 1] is ' ' or '\t')
        {
            start--;
        }

        var end = span.End;
        while (end < source.Length && source[end] is ' ' or '\t')
        {
            end++;
        }
        if (end < source.Length && source[end] == '\r')
        {
            end++;
        }
        if (end < source.Length && source[end] == '\n')
        {
            end++;
        }

        return new SourceEdit(start, end - start, string.Empty);
    }

    private static void CollectFixEdits(SyntaxNode node, string source, List<SourceEdit> edits)
    {
        if (node is FunctionDeclarationSyntax { Body: { } body } function
            && !function.IsRefReturn
            && body.OpenBraceToken.Position >= 0
            && body.OpenBraceToken.Position < source.Length
            && source[body.OpenBraceToken.Position] == '{'
            && body.Statements.Length == 1
            && body.Statements[0] is ReturnStatementSyntax { Expression: { } expression, IsRefReturn: false }
            && body.CloseBraceToken.Position >= body.OpenBraceToken.Position
            && body.CloseBraceToken.Position < source.Length)
        {
            var value = source.Substring(expression.Span.Start, expression.Span.Length);
            edits.Add(new SourceEdit(
                body.OpenBraceToken.Position,
                body.CloseBraceToken.Position - body.OpenBraceToken.Position + 1,
                "-> " + value));
        }

        if (node is PropertyAccessorSyntax { Body: { } accessorBody } accessor
            && accessorBody.Statements.Length == 1
            && accessorBody.OpenBraceToken.Position >= 0
            && accessorBody.CloseBraceToken.Position >= accessorBody.OpenBraceToken.Position
            && accessorBody.CloseBraceToken.Position < source.Length
            && source[accessorBody.OpenBraceToken.Position] == '{'
            && source[accessorBody.CloseBraceToken.Position] == '}'
            && source.AsSpan(
                    accessorBody.OpenBraceToken.Position,
                    accessorBody.CloseBraceToken.Position - accessorBody.OpenBraceToken.Position + 1)
                .IndexOfAny('\r', '\n') < 0)
        {
            var accessorExpression = accessor.IsGetter
                ? (accessorBody.Statements[0] as ReturnStatementSyntax)?.Expression
                : (accessorBody.Statements[0] as ExpressionStatementSyntax)?.Expression;
            if (accessorExpression is not null
                && (!accessor.IsGetter || accessorBody.Statements[0] is ReturnStatementSyntax { IsRefReturn: false })
                && (accessor.IsGetter || accessor.IsSetterOrInit))
            {
                var value = source.Substring(accessorExpression.Span.Start, accessorExpression.Span.Length);
                edits.Add(new SourceEdit(
                    accessorBody.OpenBraceToken.Position,
                    accessorBody.CloseBraceToken.Position - accessorBody.OpenBraceToken.Position + 1,
                    "-> " + value));
            }
        }

        if (node is FunctionDeclarationSyntax operatorFunction)
        {
            var start = operatorFunction.Identifier.Position;
            var openParenthesis = operatorFunction.OpenParenthesisToken.Position;
            if (start >= 0
                && openParenthesis > start
                && openParenthesis < source.Length
                && source.AsSpan(start, openParenthesis - start).StartsWith("operator ", StringComparison.Ordinal)
                && !char.IsWhiteSpace(source[openParenthesis - 1])
                && !char.IsLetter(source[openParenthesis - 1]))
            {
                edits.Add(new SourceEdit(openParenthesis, 0, " "));
            }
        }

        foreach (var child in node.GetChildren())
        {
            CollectFixEdits(child, source, edits);
        }
    }

}
