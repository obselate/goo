namespace Goo.Gslint;

public static partial class Program
{
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

}
