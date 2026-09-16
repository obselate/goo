using GSharp.Core.CodeAnalysis;
using GSharp.Core.CodeAnalysis.Syntax;
using GSharp.Core.CodeAnalysis.Text;
using GSharp.Formatting;

namespace Goo.Gslint;

public static class Program
{
    private const string FormatRule = "GL0001";
    private const string AliasRule = "GL0002";
    private const string InferredTypeRule = "GL0003";
    private const string VarRule = "GL0004";
    private const string DoubleBangRule = "GL0005";
    private const string PublicDocRule = "GL0006";
    private const string ImportRule = "GL0007";
    private const string ExpressionBodyRule = "GL0008";
    private const string AccessorRule = "GL0010";
    private const string OperatorSpacingRule = "GL0011";
    private static readonly HashSet<string> KnownRules =
    [
        FormatRule,
        AliasRule,
        InferredTypeRule,
        VarRule,
        DoubleBangRule,
        PublicDocRule,
        ImportRule,
        ExpressionBodyRule,
        AccessorRule,
        OperatorSpacingRule,
    ];
    private static readonly IReadOnlyDictionary<string, string> TypeAliases = new Dictionary<string, string>
    {
        ["int"] = "int32",
        ["uint"] = "uint32",
        ["long"] = "int64",
        ["ulong"] = "uint64",
        ["short"] = "int16",
        ["ushort"] = "uint16",
        ["byte"] = "uint8",
        ["sbyte"] = "int8",
        ["float"] = "float32",
        ["double"] = "float64",
    };

    public static int Main(string[] args)
    {
        try
        {
            return Run(args);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"gslint: internal error: {ex.Message}");
            return 2;
        }
    }

    private static int Run(string[] args)
    {
        var strict = false;
        var fix = false;
        var reduce = false;
        var severityOverrides = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var paths = new List<string>();
        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            if (arg == "--strict")
            {
                strict = true;
            }
            else if (arg == "--fix")
            {
                fix = true;
            }
            else if (arg == "--reduce")
            {
                reduce = true;
            }
            else if (arg == "--severity")
            {
                if (++index >= args.Length || !TryParseSeverityOverride(args[index], out var rule, out var severity))
                {
                    Console.Error.WriteLine("gslint: --severity requires ID=<error|warning|info|none>");
                    return 2;
                }

                severityOverrides[rule] = severity;
            }
            else if (arg == "--version")
            {
                Console.WriteLine("Goo.Gslint 1.1.0");
                return 0;
            }
            else if (arg.StartsWith("--", StringComparison.Ordinal))
            {
                Console.Error.WriteLine($"gslint: unknown option '{arg}'");
                return 2;
            }
            else
            {
                paths.Add(arg);
            }
        }

        if (paths.Count == 0)
        {
            paths.Add(".");
        }

        var failed = false;
        var fixedFiles = 0;
        foreach (var file in DiscoverFiles(paths))
        {
            var source = File.ReadAllText(file);
            var tree = SyntaxTree.Load(file);
            var parseErrors = tree.Diagnostics.Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error).ToList();
            if (parseErrors.Count > 0)
            {
                foreach (var diagnostic in tree.Diagnostics)
                {
                    PrintDiagnostic(diagnostic);
                    failed |= diagnostic.Severity != DiagnosticSeverity.Info;
                }

                continue;
            }

            if (fix || reduce)
            {
                var rewritten = reduce ? ReduceSource(source, file) : FixSource(tree, source);
                if (rewritten != source)
                {
                    File.WriteAllText(file, rewritten, new System.Text.UTF8Encoding(false));
                    source = rewritten;
                    tree = SyntaxTree.Load(file);
                    fixedFiles++;
                }
            }

            var findings = Analyze(tree, source, strict)
                .Select(finding => severityOverrides.TryGetValue(finding.Rule, out var severity)
                    ? finding with { Severity = severity }
                    : finding)
                .Where(finding => finding.Severity != "none")
                .OrderBy(finding => finding.Location.Span.Start)
                .ThenBy(finding => finding.Rule, StringComparer.Ordinal)
                .ToList();
            foreach (var finding in findings)
            {
                PrintFinding(finding);
                failed |= finding.Severity is "warning" or "error";
            }
        }

        if (fix || reduce)
        {
            Console.WriteLine($"gslint: {(reduce ? "reduced" : "fixed")} {fixedFiles} file(s)");
        }

        return failed ? 1 : 0;
    }

    private static bool TryParseSeverityOverride(string value, out string rule, out string severity)
    {
        var separator = value.IndexOf('=');
        rule = separator > 0 ? value[..separator] : string.Empty;
        severity = separator > 0 ? value[(separator + 1)..].ToLowerInvariant() : string.Empty;
        return KnownRules.Contains(rule) && severity is "error" or "warning" or "info" or "none";
    }

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
        CollectBooleanReturnEdits(tree.Root, source, edits);
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

    private static void CollectBooleanReturnEdits(SyntaxNode node, string source, List<SourceEdit> edits)
    {
        if (node is BlockStatementSyntax block)
        {
            for (var index = 0; index < block.Statements.Length; index++)
            {
                if (block.Statements[index] is not IfStatementSyntax { Initializer: null } conditional
                    || !TrySingleBooleanReturn(conditional.ThenStatement, out var whenTrue))
                {
                    continue;
                }

                if (conditional.ElseClause is { } clause
                    && TrySingleBooleanReturn(clause.ElseStatement, out var whenFalse)
                    && whenTrue != whenFalse)
                {
                    AddBooleanReturnEdit(conditional.Span, conditional.Condition, whenTrue, source, edits);
                }
                else if (conditional.ElseClause is null
                    && index + 1 < block.Statements.Length
                    && block.Statements[index + 1] is ReturnStatementSyntax trailing
                    && TryBoolean(trailing, out whenFalse)
                    && whenTrue != whenFalse)
                {
                    var span = TextSpan.FromBounds(conditional.Span.Start, trailing.Span.End);
                    AddBooleanReturnEdit(span, conditional.Condition, whenTrue, source, edits);
                    index++;
                }
            }
        }

        foreach (var child in node.GetChildren())
        {
            CollectBooleanReturnEdits(child, source, edits);
        }
    }

    private static bool TrySingleBooleanReturn(StatementSyntax statement, out bool value)
    {
        if (statement is BlockStatementSyntax { Statements.Length: 1 } block
            && block.Statements[0] is ReturnStatementSyntax result)
        {
            return TryBoolean(result, out value);
        }

        if (statement is ReturnStatementSyntax direct)
        {
            return TryBoolean(direct, out value);
        }

        value = false;
        return false;
    }

    private static bool TryBoolean(ReturnStatementSyntax statement, out bool value)
    {
        if (statement.Expression is LiteralExpressionSyntax { Value: bool literal })
        {
            value = literal;
            return true;
        }

        value = false;
        return false;
    }

    private static void AddBooleanReturnEdit(
        TextSpan span,
        ExpressionSyntax condition,
        bool returnWhenTrue,
        string source,
        List<SourceEdit> edits)
    {
        var expression = source.Substring(condition.Span.Start, condition.Span.Length);
        edits.Add(new SourceEdit(span.Start, span.Length,
            returnWhenTrue ? $"return {expression}" : $"return !({expression})"));
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

    private static IReadOnlyList<Finding> Analyze(SyntaxTree tree, string source, bool strict)
    {
        var findings = new List<Finding>();
        var result = GSharpFormatter.Format(tree.Text);
        var formatted = result.Text?.ToString() ?? source;
        if (result.Text is null)
        {
            findings.Add(new Finding(FormatRule, "warning", tree.Root.Location,
                "canonical formatter rejected this source: " + string.Join(" ", result.Diagnostics)));
        }
        if (source != formatted)
        {
            var position = FirstDifference(source, formatted);
            findings.Add(new Finding(
                FormatRule,
                "warning",
                new TextLocation(tree.Text, new TextSpan(position, 0)),
                "file is not canonically formatted (upstream ADR-0179); first difference here"));
        }

        var tokens = SyntaxTree.ParseTokens(source);
        var nonWhitespaceTokens = tokens.Where(token => token.Kind != SyntaxKind.WhitespaceToken).ToList();
        AddVarFindings(tree.Root, strict, findings);
        Walk(tree.Root, source, strict, nonWhitespaceTokens, findings, true);
        return findings;
    }

    private static void Walk(
        SyntaxNode node,
        string source,
        bool strict,
        List<SyntaxToken> nonWhitespaceTokens,
        List<Finding> findings,
        bool isEffectivelyPublic)
    {
        if (node is StructDeclarationSyntax structDeclaration)
        {
            isEffectivelyPublic &= IsPublic(structDeclaration.AccessibilityModifier);
        }
        else if (node is EnumDeclarationSyntax enumDeclaration)
        {
            isEffectivelyPublic &= IsPublic(enumDeclaration.AccessibilityModifier);
        }
        else if (node is InterfaceDeclarationSyntax interfaceDeclaration)
        {
            isEffectivelyPublic &= IsPublic(interfaceDeclaration.AccessibilityModifier);
        }

        if (node is SyntaxToken { Kind: SyntaxKind.BangBangToken } doubleBang)
        {
            findings.Add(new Finding(
                DoubleBangRule,
                strict ? "warning" : "info",
                doubleBang.Location,
                "reserve !! for immediate-failure sites"));
        }

        AddAliasFindings(node, findings);
        AddInferredTypeFinding(node, findings);
        AddPublicDocFinding(node, strict, nonWhitespaceTokens, findings, isEffectivelyPublic);
        AddImportFindings(node, findings);
        AddExpressionBodyFinding(node, source, strict, findings);
        AddAccessorFinding(node, source, findings);
        AddOperatorSpacingFinding(node, source, findings);

        foreach (var child in node.GetChildren())
        {
            Walk(child, source, strict, nonWhitespaceTokens, findings, isEffectivelyPublic);
        }
    }

    private static void AddAliasFindings(SyntaxNode node, List<Finding> findings)
    {
        switch (node)
        {
            case FunctionDeclarationSyntax declaration when IsPublic(declaration.AccessibilityModifier):
                foreach (var parameter in declaration.Parameters)
                {
                    AddAliasFindings(parameter.Type, findings);
                }

                AddAliasFindings(declaration.Type, findings);
                break;

            case FieldDeclarationSyntax declaration when IsPublic(declaration.AccessibilityModifier):
                AddAliasFindings(declaration.Type, findings);
                break;

            case PropertyDeclarationSyntax declaration when IsPublic(declaration.AccessibilityModifier):
                AddAliasFindings(declaration.Type, findings);
                foreach (var parameter in declaration.Parameters)
                {
                    AddAliasFindings(parameter.Type, findings);
                }

                break;

            case VariableDeclarationSyntax declaration when IsPublic(declaration.AccessibilityModifier):
                AddAliasFindings(declaration.TypeClause, findings);
                break;

            case DelegateDeclarationSyntax declaration when IsPublic(declaration.AccessibilityModifier):
                foreach (var parameter in declaration.Parameters)
                {
                    AddAliasFindings(parameter.Type, findings);
                }

                AddAliasFindings(declaration.ReturnType, findings);
                break;
        }
    }

    private static void AddAliasFindings(TypeClauseSyntax? type, List<Finding> findings)
    {
        foreach (var token in FindAliasTokens(type))
        {
            var canonical = TypeAliases[token.Text];
            findings.Add(new Finding(
                AliasRule,
                "warning",
                token.Location,
                $"public API uses alias '{token.Text}'; prefer canonical '{canonical}'"));
        }
    }

    private static IEnumerable<SyntaxToken> FindAliasTokens(TypeClauseSyntax? type)
    {
        if (type is null)
        {
            yield break;
        }

        if (!type.HasQualifier && type.Identifier is not null && TypeAliases.ContainsKey(type.Identifier.Text))
        {
            yield return type.Identifier;
        }

        foreach (var token in FindAliasTokens(type.ArrayElementType))
        {
            yield return token;
        }

        foreach (var token in FindAliasTokens(type.ReturnTypeClause))
        {
            yield return token;
        }

        foreach (var token in FindAliasTokens(type.MapKeyType))
        {
            yield return token;
        }

        foreach (var token in FindAliasTokens(type.MapValueType))
        {
            yield return token;
        }

        foreach (var token in FindAliasTokens(type.ChanElementType))
        {
            yield return token;
        }

        foreach (var token in FindAliasTokens(type.PointerPointeeType))
        {
            yield return token;
        }

        foreach (var token in FindAliasTokens(type.SequenceElementType))
        {
            yield return token;
        }

        if (type.TypeArguments is not null)
        {
            foreach (var argument in type.TypeArguments)
            {
                foreach (var token in FindAliasTokens(argument))
                {
                    yield return token;
                }
            }
        }

        if (type.TupleElements is not null)
        {
            foreach (var element in type.TupleElements)
            {
                foreach (var token in FindAliasTokens(element))
                {
                    yield return token;
                }
            }
        }

        if (type.FunctionParameterTypes is not null)
        {
            foreach (var parameter in type.FunctionParameterTypes)
            {
                foreach (var token in FindAliasTokens(parameter))
                {
                    yield return token;
                }
            }
        }
    }

    private static void AddInferredTypeFinding(SyntaxNode node, List<Finding> findings)
    {
        if (node is not VariableDeclarationSyntax { TypeClause: null, Initializer: not null } declaration
            || !IsPublic(declaration.AccessibilityModifier))
        {
            return;
        }

        findings.Add(new Finding(
            InferredTypeRule,
            "warning",
            declaration.Identifier.Location,
            $"public binding '{declaration.Identifier.Text}' has no explicit type clause; its type is inferred from the initializer"));
    }

    private static void AddVarFindings(SyntaxNode node, bool strict, List<Finding> findings)
    {
        switch (node)
        {
            case CompilationUnitSyntax compilationUnit:
                var topLevelStatements = new List<SyntaxNode>();
                foreach (var member in compilationUnit.Members)
                {
                    if (member is GlobalStatementSyntax { Statement: not null } global)
                    {
                        topLevelStatements.Add(global.Statement);
                    }
                }

                AnalyzeVarScope(topLevelStatements, strict, findings);
                break;

            case FunctionDeclarationSyntax { Body: not null } function:
                AnalyzeVarScope(new SyntaxNode[] { function.Body }, strict, findings);
                break;

            case ConstructorDeclarationSyntax { Body: not null } constructor:
                AnalyzeVarScope(new SyntaxNode[] { constructor.Body }, strict, findings);
                break;
        }

        foreach (var child in node.GetChildren())
        {
            AddVarFindings(child, strict, findings);
        }
    }

    private static void AnalyzeVarScope(IEnumerable<SyntaxNode> roots, bool strict, List<Finding> findings)
    {
        var declarations = new List<VariableDeclarationSyntax>();
        var nameCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        var reassigned = new HashSet<string>(StringComparer.Ordinal);
        foreach (var root in roots)
        {
            CollectVarState(root, declarations, nameCounts, reassigned);
        }

        foreach (var declaration in declarations)
        {
            var name = declaration.Identifier.Text;
            if (nameCounts.GetValueOrDefault(name) > 1 || reassigned.Contains(name))
            {
                continue;
            }

            findings.Add(new Finding(
                VarRule,
                strict ? "warning" : "info",
                declaration.Identifier.Location,
                $"'{name}' is declared with 'var' but never reassigned; consider 'let'"));
        }
    }

    private static void CollectVarState(
        SyntaxNode node,
        List<VariableDeclarationSyntax> declarations,
        Dictionary<string, int> nameCounts,
        HashSet<string> reassigned)
    {
        switch (node)
        {
            case FunctionDeclarationSyntax:
            case ConstructorDeclarationSyntax:
                return;

            case VariableDeclarationSyntax declaration:
                nameCounts[declaration.Identifier.Text] = nameCounts.GetValueOrDefault(declaration.Identifier.Text) + 1;
                if (declaration.Keyword?.Kind == SyntaxKind.VarKeyword && declaration.Initializer is not null)
                {
                    declarations.Add(declaration);
                }

                break;

            case AssignmentExpressionSyntax assignment:
                reassigned.Add(assignment.IdentifierToken.Text);
                break;

            case FieldAssignmentExpressionSyntax assignment:
                reassigned.Add(assignment.Receiver.Text);
                break;

            case MemberFieldAssignmentExpressionSyntax assignment:
                AddRootName(assignment.Receiver, reassigned);
                break;

            case MultiAssignmentStatementSyntax assignment:
                foreach (var target in assignment.Targets)
                {
                    if (target is NameExpressionSyntax name)
                    {
                        reassigned.Add(name.IdentifierToken.Text);
                    }
                }

                break;

            case IndexAssignmentExpressionSyntax assignment:
                reassigned.Add(assignment.TargetIdentifier.Text);
                break;

            case MemberIndexAssignmentExpressionSyntax assignment:
                AddRootName(assignment.Target.Target, reassigned);
                break;

            case CompoundIndexAssignmentExpressionSyntax assignment:
                AddRootName(assignment.Target.Target, reassigned);
                break;

            case EventSubscriptionExpressionSyntax subscription:
                AddRootName(subscription.LeftHandSide, reassigned);
                break;

            case NullCoalescingAssignmentStatementSyntax assignment:
                AddRootName(assignment.Target, reassigned);
                break;

            case RefArgumentExpressionSyntax { Expression: NameExpressionSyntax name }:
                reassigned.Add(name.IdentifierToken.Text);
                break;

            case UnaryExpressionSyntax
            {
                OperatorToken.Kind: SyntaxKind.PlusPlusToken or SyntaxKind.MinusMinusToken,
                Operand: NameExpressionSyntax name,
            }:
                reassigned.Add(name.IdentifierToken.Text);
                break;

            case UnaryExpressionSyntax
            {
                OperatorToken.Kind: SyntaxKind.AmpersandToken,
                Operand: NameExpressionSyntax name,
            }:
                reassigned.Add(name.IdentifierToken.Text);
                break;
        }

        foreach (var child in node.GetChildren())
        {
            CollectVarState(child, declarations, nameCounts, reassigned);
        }
    }

    private static void AddRootName(ExpressionSyntax expression, HashSet<string> reassigned)
    {
        switch (expression)
        {
            case NameExpressionSyntax name:
                reassigned.Add(name.IdentifierToken.Text);
                break;
            case AccessorExpressionSyntax accessor:
                AddRootName(accessor.LeftPart, reassigned);
                break;
            case IndexExpressionSyntax index:
                AddRootName(index.Target, reassigned);
                break;
            case ParenthesizedExpressionSyntax parenthesized:
                AddRootName(parenthesized.Expression, reassigned);
                break;
        }
    }

    private static void AddPublicDocFinding(
        SyntaxNode node,
        bool strict,
        List<SyntaxToken> nonWhitespaceTokens,
        List<Finding> findings,
        bool isEffectivelyPublic)
    {
        var (isPublic, kind, name, location) = node switch
        {
            FunctionDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), "func", declaration.Identifier.Text, declaration.Identifier.Location),
            StructDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), declaration.IsClass ? "class" : "struct", declaration.Identifier.Text, declaration.Identifier.Location),
            EnumDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), "enum", declaration.Identifier.Text, declaration.Identifier.Location),
            InterfaceDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), "interface", declaration.Identifier.Text, declaration.Identifier.Location),
            DelegateDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), "delegate", declaration.Identifier.Text, declaration.Identifier.Location),
            PropertyDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), "property", declaration.Identifier.Text, declaration.Identifier.Location),
            FieldDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), "field", declaration.Identifier.Text, declaration.Identifier.Location),
            EventDeclarationSyntax declaration =>
                (IsPublic(declaration.AccessibilityModifier), "event", declaration.Identifier.Text, declaration.Identifier.Location),
            _ => (false, string.Empty, string.Empty, default),
        };

        if (!isPublic || !isEffectivelyPublic)
        {
            return;
        }

        var previousIndex = nonWhitespaceTokens.FindLastIndex(token => token.Position < node.Span.Start);
        if (previousIndex >= 0 && nonWhitespaceTokens[previousIndex].Kind == SyntaxKind.DocumentationCommentToken)
        {
            return;
        }

        findings.Add(new Finding(
            PublicDocRule,
            strict ? "warning" : "info",
            location,
            $"public {kind} '{name}' has no leading /// documentation comment"));
    }

    private static void AddImportFindings(SyntaxNode node, List<Finding> findings)
    {
        if (node is not CompilationUnitSyntax compilationUnit)
        {
            return;
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var member in compilationUnit.Members)
        {
            if (member is not ImportSyntax import)
            {
                continue;
            }

            var path = string.Join('.', import.Identifiers.Select(token => token.Text));
            if (!seen.Add(path))
            {
                findings.Add(new Finding(
                    ImportRule,
                    "warning",
                    import.Location,
                    $"duplicate import '{path}'"));
            }
        }
    }

    private static void AddExpressionBodyFinding(
        SyntaxNode node,
        string source,
        bool strict,
        List<Finding> findings)
    {
        if (node is not FunctionDeclarationSyntax { Body: { } body } function
            || function.IsRefReturn
            || body.OpenBraceToken.Position >= source.Length
            || source[body.OpenBraceToken.Position] != '{'
            || body.Statements.Length != 1
            || body.Statements[0] is not ReturnStatementSyntax { Expression: not null, IsRefReturn: false })
        {
            return;
        }

        findings.Add(new Finding(
            ExpressionBodyRule,
            strict ? "warning" : "info",
            function.Location,
            "prefer an expression body: -> expr"));
    }

    private static void AddAccessorFinding(SyntaxNode node, string source, List<Finding> findings)
    {
        if (node is not PropertyAccessorSyntax { Body: { } body } accessor
            || body.Statements.Length != 1
            || !HasSingleExpression(accessor, body)
            || body.OpenBraceToken.Position < 0
            || body.CloseBraceToken.Position < body.OpenBraceToken.Position
            || body.CloseBraceToken.Position >= source.Length
            || source[body.OpenBraceToken.Position] != '{'
            || source[body.CloseBraceToken.Position] != '}'
            || source.AsSpan(
                    body.OpenBraceToken.Position,
                    body.CloseBraceToken.Position - body.OpenBraceToken.Position + 1)
                .IndexOfAny('\r', '\n') >= 0)
        {
            return;
        }

        findings.Add(new Finding(
            AccessorRule,
            "warning",
            accessor.Location,
            "prefer an expression-bodied accessor: accessor -> expr"));
    }

    private static void AddOperatorSpacingFinding(SyntaxNode node, string source, List<Finding> findings)
    {
        if (node is not FunctionDeclarationSyntax function)
        {
            return;
        }

        var start = function.Identifier.Position;
        var openParenthesis = function.OpenParenthesisToken.Position;
        if (start < 0
            || openParenthesis <= start
            || openParenthesis >= source.Length
            || !source.AsSpan(start, openParenthesis - start).StartsWith("operator ", StringComparison.Ordinal)
            || char.IsWhiteSpace(source[openParenthesis - 1])
            || char.IsLetter(source[openParenthesis - 1]))
        {
            return;
        }

        findings.Add(new Finding(
            OperatorSpacingRule,
            "warning",
            function.Location,
            "put a space between the operator and parameter list"));
    }

    private static bool HasSingleExpression(PropertyAccessorSyntax accessor, BlockStatementSyntax body) =>
        accessor.IsGetter
            ? body.Statements[0] is ReturnStatementSyntax { Expression: not null, IsRefReturn: false }
            : accessor.IsSetterOrInit && body.Statements[0] is ExpressionStatementSyntax;

    private static bool IsPublic(SyntaxToken? modifier) =>
        modifier is not null && modifier.Kind == SyntaxKind.PublicKeyword;

    private static int FirstDifference(string source, string formatted)
    {
        var max = Math.Min(source.Length, formatted.Length);
        var index = 0;
        while (index < max && source[index] == formatted[index])
        {
            index++;
        }

        return source.Length == 0 ? 0 : Math.Min(index, source.Length - 1);
    }

    private static IReadOnlyList<string> DiscoverFiles(IEnumerable<string> paths)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var path in paths)
        {
            if (File.Exists(path))
            {
                if (Path.GetExtension(path) == ".gs")
                {
                    result.Add(Path.GetFullPath(path));
                }

                continue;
            }

            if (!Directory.Exists(path))
            {
                throw new DirectoryNotFoundException($"path not found: {path}");
            }

            WalkDirectory(path, result);
        }

        return result.OrderBy(path => path, StringComparer.Ordinal).ToList();
    }

    private static void WalkDirectory(string directory, HashSet<string> result)
    {
        foreach (var file in Directory.EnumerateFiles(directory, "*.gs").OrderBy(path => path, StringComparer.Ordinal))
        {
            result.Add(Path.GetFullPath(file));
        }

        foreach (var subdirectory in Directory.EnumerateDirectories(directory).OrderBy(path => path, StringComparer.Ordinal))
        {
            var name = Path.GetFileName(subdirectory);
            if (name is "bin" or "obj" || name.StartsWith('.'))
            {
                continue;
            }

            WalkDirectory(subdirectory, result);
        }
    }

    private static void PrintFinding(Finding finding)
    {
        var file = finding.Location.FileName ?? string.Empty;
        Console.WriteLine(
            $"{file}({finding.Location.StartLine + 1},{finding.Location.StartCharacter + 1}): " +
            $"{finding.Severity} {finding.Rule}: {finding.Message}");
    }

    private static void PrintDiagnostic(Diagnostic diagnostic)
    {
        if (diagnostic.Location.Text is null)
        {
            Console.WriteLine($"{diagnostic.Id}: {diagnostic.Message}");
            return;
        }

        var severity = diagnostic.Severity switch
        {
            DiagnosticSeverity.Error => "error",
            DiagnosticSeverity.Warning => "warning",
            _ => "info",
        };
        Console.WriteLine(
            $"{diagnostic.Location.FileName}({diagnostic.Location.StartLine + 1},{diagnostic.Location.StartCharacter + 1}): " +
            $"{severity} {diagnostic.Id}: {diagnostic.Message}");
    }

    private sealed record Finding(string Rule, string Severity, TextLocation Location, string Message);

    private readonly record struct SourceEdit(int Start, int Length, string Text);
}
