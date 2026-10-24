package Goo.Gslint

import GSharp.Core.CodeAnalysis
import GSharp.Core.CodeAnalysis.Syntax
import GSharp.Core.CodeAnalysis.Text
import GSharp.Formatting
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text

shared
class Program {
    private data class Finding(Rule string, Severity string, Location TextLocation, Message string) : IEquatable[
        Finding
    ] { }

    private data struct SourceEdit(Start int32, Length int32, Text string) : IEquatable[SourceEdit] { }

    private const FormatRule string = "GL0001"
    private const AliasRule string = "GL0002"
    private const InferredTypeRule string = "GL0003"
    private const VarRule string = "GL0004"
    private const DoubleBangRule string = "GL0005"
    private const PublicDocRule string = "GL0006"
    private const ImportRule string = "GL0007"
    private const ExpressionBodyRule string = "GL0008"
    private const AccessorRule string = "GL0010"
    private const OperatorSpacingRule string = "GL0011"
    private let KnownRules HashSet[string] = HashSet[string]{
        FormatRule,
        AliasRule,
        InferredTypeRule,
        VarRule,
        DoubleBangRule,
        PublicDocRule,
        ImportRule,
        ExpressionBodyRule,
        AccessorRule,
        OperatorSpacingRule
    }
    private let TypeAliases IReadOnlyDictionary[string, string] = Dictionary[string, string]{
        ["int"] = "int32",
        ["uint"] = "uint32",
        ["long"] = "int64",
        ["ulong"] = "uint64",
        ["short"] = "int16",
        ["ushort"] = "uint16",
        ["byte"] = "uint8",
        ["sbyte"] = "int8",
        ["float"] = "float32",
        ["double"] = "float64"
    }

    func Main(args[]string) int32 {
        try {
            return Run(args)
        } catch (ex Exception) {
            Console.Error.WriteLine("gslint: internal error: ${ex.Message}")
            return 2
        }
    }

    private func Run(args[]string) int32 {
        var strict = false
        var fix = false
        var reduce = false
        let severityOverrides = Dictionary[string, string](StringComparer.OrdinalIgnoreCase)
        let paths = List[string]()
        for var index = 0; index < args.Length; index++ {
            let arg = args[index]
            if arg == "--strict" {
                strict = true
            } else if arg == "--fix" {
                fix = true
            } else if arg == "--reduce" {
                reduce = true
            } else if arg == "--severity" {
                if (index += 1) >= args.Length ||
                    !TryParseSeverityOverride(args[index], out var rule, out var severity) {
                    Console.Error.WriteLine("gslint: --severity requires ID=<error|warning|info|none>")
                    return 2
                }
                severityOverrides[rule] = severity
            } else if arg == "--version" {
                Console.WriteLine("Goo.Gslint 1.2.0")
                return 0
            } else if arg.StartsWith("--", StringComparison.Ordinal) {
                Console.Error.WriteLine("gslint: unknown option '$arg'")
                return 2
            } else {
                paths.Add(arg)
            }
        }
        if paths.Count == 0 {
            paths.Add(".")
        }
        var failed = false
        var fixedFiles = 0
        for file in DiscoverFiles(paths) {
            var source = File.ReadAllText(file)
            var tree = SyntaxTree.Load(file)
            let parseErrors = tree
                .Diagnostics
                .Where((diagnostic Diagnostic) -> diagnostic.Severity == DiagnosticSeverity.Error)
                .ToList()
            if parseErrors.Count > 0 {
                for diagnostic in tree.Diagnostics {
                    PrintDiagnostic(diagnostic)
                    failed |= diagnostic.Severity != DiagnosticSeverity.Info
                }
                continue
            }
            if fix || reduce {
                let rewritten = if reduce {
                    ReduceSource(source, file)
                } else {
                    FixSource(tree, source)
                }
                if rewritten != source {
                    File.WriteAllText(file, rewritten, UTF8Encoding(false))
                    source = rewritten
                    tree = SyntaxTree.Load(file)
                    fixedFiles++
                }
            }
            let findings = Analyze(tree, source, strict)
                .Select(
                (finding Finding) -> if severityOverrides.TryGetValue(finding.Rule, out var severity) {
                    finding with{Severity = severity}
                } else {
                    finding
                }
            )
                .Where((finding Finding) -> finding.Severity != "none")
                .OrderBy((finding Finding) -> finding.Location.Span.Start)
                .ThenBy((finding Finding) -> finding.Rule, StringComparer.Ordinal)
                .ToList()
            for finding in findings {
                PrintFinding(finding)
                failed |= (finding.Severity is "warning" or "error")
            }
        }
        if fix || reduce {
            Console.WriteLine("gslint: ${(if reduce { "reduced" } else { "fixed" })} $fixedFiles file(s)")
        }
        return if failed {
            1
        } else {
            0
        }
    }

    private func TryParseSeverityOverride(value string, out rule string, out severity string) bool {
        let separator = value.IndexOf('=')
        rule = if separator > 0 {
            value[.. separator]
        } else {
            string.Empty
        }
        severity = if separator > 0 {
            value[(separator + 1) ..].ToLowerInvariant()
        } else {
            string.Empty
        }
        return KnownRules.Contains(rule) &&
            (severity == "error" || severity == "warning" || severity == "info" || severity == "none")
    }

    private func FixSource(tree SyntaxTree, source string) string {
        let rewritten = RewriteSource(tree, source)
        return GSharpFormatter.Format(SourceText.From(rewritten)).Text?.ToString() ?? source
    }

    private func ReduceSource(source string, file string) string {
        var source = source
        for var pass = 0; pass < 4; pass++ {
            let tree = SyntaxTree.Parse(SourceText.From(source, file))
            if tree.Diagnostics.Any((diagnostic Diagnostic) -> diagnostic.Severity == DiagnosticSeverity.Error) {
                return source
            }
            let rewritten = RewriteSource(tree, source)
            if rewritten == source {
                break
            }
            source = rewritten
        }
        return source
    }

    private func RewriteSource(tree SyntaxTree, source string) string {
        let edits = List[SourceEdit]()
        CollectFixEdits(tree.Root, source, edits)
        CollectConditionalReturnEdits(tree.Root, source, edits)
        let varFindings = List[Finding]()
        AddVarFindings(tree.Root, true, varFindings)
        for finding in varFindings.Where((finding Finding) -> finding.Rule == VarRule) {
            var keywordEnd = finding.Location.Span.Start
            while keywordEnd > 0 && char.IsWhiteSpace(source[keywordEnd - 1]) {
                keywordEnd--
            }
            let keywordStart = keywordEnd - 3
            if keywordStart >= 0 && source.AsSpan(keywordStart, 3).SequenceEqual("var") {
                edits.Add(SourceEdit(keywordStart, 3, "let"))
            }
        }
        edits.Sort((left SourceEdit, right SourceEdit) -> right.Start.CompareTo(left.Start))
        var rewritten = source
        for edit in edits {
            rewritten = rewritten.Remove(edit.Start, edit.Length).Insert(edit.Start, edit.Text)
        }
        return rewritten
    }

    private func CollectConditionalReturnEdits(node SyntaxNode, source string, edits List[SourceEdit]) {
        if node is BlockStatementSyntax block {
            for var index = 0; index < block.Statements.Length; index++ {
                if block.Statements[index] is not IfStatementSyntax{Initializer: nil} conditional ||
                    !TrySingleReturn(conditional.ThenStatement, out var whenTrue) {
                    continue
                }
                if conditional.ElseClause is {} clause && TrySingleReturn(clause.ElseStatement, out var whenFalse) {
                    AddConditionalReturnEdit(
                        conditional.Span,
                        conditional.Condition,
                        whenTrue!!,
                        whenFalse!!,
                        source,
                        edits
                    )
                } else if conditional.ElseClause == nil &&
                    index +
                    1 < block
                    .Statements
                    .Length &&
                    block.Statements[index + 1] is ReturnStatementSyntax trailing &&
                    trailing.Expression is {} trailingExpression &&
                    !trailing
                    .IsRefReturn {
                    let span = TextSpan.FromBounds(conditional.Span.Start, trailing.Span.End)
                    AddConditionalReturnEdit(span, conditional.Condition, whenTrue!!, trailingExpression, source, edits)
                    index++
                }
            }
        }
        for child in node.GetChildren() {
            CollectConditionalReturnEdits(child, source, edits)
        }
    }

    private func TrySingleReturn(statement StatementSyntax, out expression ExpressionSyntax?) bool {
        if statement is BlockStatementSyntax{Statements: {Length: 1}} block &&
            block.Statements[0] is ReturnStatementSyntax{Expression: {} value, IsRefReturn: false} {
            expression = value
            return true
        }
        if statement is ReturnStatementSyntax{Expression: {} direct, IsRefReturn: false} {
            expression = direct
            return true
        }
        expression = nil
        return false
    }

    private func AddConditionalReturnEdit(
        span TextSpan,
        condition ExpressionSyntax,
        whenTrue ExpressionSyntax,
        whenFalse ExpressionSyntax,
        source string,
        edits List[SourceEdit]
    ) {
        let Source = (value SyntaxNode) -> source.Substring(value.Span.Start, value.Span.Length)
        let original = source.Substring(span.Start, span.Length)
        if original.Contains("//", StringComparison.Ordinal) || original.Contains("/*", StringComparison.Ordinal) {
            return
        }
        let test = Source(condition)
        let success = Source(whenTrue)
        let failure = Source(whenFalse)
        if TryBoolean(whenTrue, out var trueValue) &&
            TryBoolean(whenFalse, out var falseValue) &&
            trueValue != falseValue {
            edits.Add(
                SourceEdit(
                    span.Start,
                    span.Length,
                    if trueValue {
                        "return $test"
                    } else {
                        "return !($test)"
                    }
                )
            )
            return
        }
        if !IsSimpleConditional(test, success, failure) {
            return
        }
        edits.Add(SourceEdit(span.Start, span.Length, "return if $test { $success } else { $failure }"))
    }

    private func IsSimpleConditional(condition string, whenTrue string, whenFalse string) bool {
        let combinedLength = condition.Length + whenTrue.Length + whenFalse.Length
        return combinedLength <= 120 &&
            !ContainsLineBreak(condition) &&
            !ContainsLineBreak(whenTrue) &&
            !ContainsLineBreak(whenFalse) &&
            !condition.Contains("nil", StringComparison.Ordinal) && !condition.Contains(
            " is ",
            StringComparison.Ordinal
        ) &&
            !condition.Contains("let ", StringComparison.Ordinal) && IsSimpleValue(whenTrue) && IsSimpleValue(whenFalse)
    }

    private func IsSimpleValue(value string) bool -> !value.Contains('{') && !value.Contains('}') && !value.StartsWith(
        "if ",
        StringComparison.Ordinal
    ) &&
        !value.StartsWith("switch ", StringComparison.Ordinal)

    private func ContainsLineBreak(value string) bool -> value.Contains('\r') || value.Contains('\n')

    private func TryBoolean(expression ExpressionSyntax, out value bool) bool {
        if expression is LiteralExpressionSyntax{Value: bool literal} {
            value = literal
            return true
        }
        value = false
        return false
    }

    private func CollectFixEdits(node SyntaxNode, source string, edits List[SourceEdit]) {
        if node is FunctionDeclarationSyntax{Body: {} body} function &&
            !function.IsRefReturn &&
            body
            .OpenBraceToken
            .Position >= 0 &&
            body
            .OpenBraceToken
            .Position < source.Length &&
            source[body.OpenBraceToken.Position] == '{' &&
            body
            .Statements
            .Length == 1 &&
            body.Statements[0] is ReturnStatementSyntax{Expression: {} expression, IsRefReturn: false} &&
            body
            .CloseBraceToken
            .Position >= body
            .OpenBraceToken
            .Position &&
            body
            .CloseBraceToken
            .Position < source
            .Length {
            let value = source.Substring(expression.Span.Start, expression.Span.Length)
            edits.Add(
                SourceEdit(
                    body.OpenBraceToken.Position,
                    body.CloseBraceToken.Position - body.OpenBraceToken.Position + 1,
                    "-> " + value
                )
            )
        }
        if node is PropertyAccessorSyntax{Body: {} accessorBody} accessor &&
            accessorBody
            .Statements
            .Length == 1 &&
            accessorBody
            .OpenBraceToken
            .Position >= 0 &&
            accessorBody
            .CloseBraceToken
            .Position >= accessorBody
            .OpenBraceToken
            .Position &&
            accessorBody
            .CloseBraceToken
            .Position < source.Length &&
            source[accessorBody.OpenBraceToken.Position] == '{' &&
            source[accessorBody.CloseBraceToken.Position] == '}' &&
            source
            .AsSpan(
            accessorBody.OpenBraceToken.Position,
            accessorBody.CloseBraceToken.Position - accessorBody.OpenBraceToken.Position + 1
        )
            .IndexOfAny('\r', '\n') < 0 {
            let accessorExpression ExpressionSyntax? = if accessor.IsGetter {
                (accessorBody.Statements[0] as ReturnStatementSyntax)?.Expression
            } else {
                (accessorBody.Statements[0] as ExpressionStatementSyntax)?.Expression
            }
            if accessorExpression != nil &&
                (
                !accessor.IsGetter || (accessorBody.Statements[0] is ReturnStatementSyntax and {IsRefReturn: false})
            ) &&
                (accessor.IsGetter || accessor.IsSetterOrInit) {
                let value = source.Substring(accessorExpression.Span.Start, accessorExpression.Span.Length)
                edits.Add(
                    SourceEdit(
                        accessorBody.OpenBraceToken.Position,
                        accessorBody.CloseBraceToken.Position - accessorBody.OpenBraceToken.Position + 1,
                        "-> " + value
                    )
                )
            }
        }
        if node is FunctionDeclarationSyntax operatorFunction {
            let start = operatorFunction.Identifier.Position
            let openParenthesis = operatorFunction.OpenParenthesisToken.Position
            if start >= 0 && openParenthesis > start && openParenthesis < source.Length && source.AsSpan(
                start,
                openParenthesis - start
            )
                .StartsWith("operator ", StringComparison.Ordinal) && !char.IsWhiteSpace(source[openParenthesis - 1]) &&
                !char.IsLetter(source[openParenthesis - 1]) {
                edits.Add(SourceEdit(openParenthesis, 0, " "))
            }
        }
        for child in node.GetChildren() {
            CollectFixEdits(child, source, edits)
        }
    }

    private func Analyze(tree SyntaxTree, source string, strict bool) IReadOnlyList[Finding] {
        let findings = List[Finding]()
        let result = GSharpFormatter.Format(tree.Text)
        let formatted = result.Text?.ToString() ?? source
        if result.Text == nil {
            findings.Add(
                Finding(
                    FormatRule,
                    "warning",
                    tree.Root.Location,
                    "canonical formatter rejected this source: " + string.Join(" ", result.Diagnostics)
                )
            )
        }
        if source != formatted {
            let position = FirstDifference(source, formatted)
            findings.Add(
                Finding(
                    FormatRule,
                    "warning",
                    TextLocation(tree.Text, TextSpan(position, 0)),
                    "file is not canonically formatted (upstream ADR-0179); first difference here"
                )
            )
        }
        let tokens = SyntaxTree.ParseTokens(source)
        let nonWhitespaceTokens = tokens.Where((token SyntaxToken) -> token.Kind != SyntaxKind.WhitespaceToken).ToList()
        AddVarFindings(tree.Root, strict, findings)
        Walk(tree.Root, source, strict, nonWhitespaceTokens, findings, true)
        return findings
    }

    private func Walk(
        node SyntaxNode,
        source string,
        strict bool,
        nonWhitespaceTokens List[SyntaxToken],
        findings List[Finding],
        isEffectivelyPublic bool
    ) {
        var isEffectivelyPublic = isEffectivelyPublic
        if node is StructDeclarationSyntax structDeclaration {
            isEffectivelyPublic &= IsPublic(structDeclaration.AccessibilityModifier)
        } else if node is EnumDeclarationSyntax enumDeclaration {
            isEffectivelyPublic &= IsPublic(enumDeclaration.AccessibilityModifier)
        } else if node is InterfaceDeclarationSyntax interfaceDeclaration {
            isEffectivelyPublic &= IsPublic(interfaceDeclaration.AccessibilityModifier)
        }
        if node is SyntaxToken{Kind: SyntaxKind.BangBangToken} doubleBang {
            findings.Add(
                Finding(
                    DoubleBangRule,
                    if strict {
                        "warning"
                    } else {
                        "info"
                    },
                    doubleBang.Location,
                    "reserve !! for immediate-failure sites"
                )
            )
        }
        AddAliasFindings(node, findings)
        AddInferredTypeFinding(node, findings)
        AddPublicDocFinding(node, strict, nonWhitespaceTokens, findings, isEffectivelyPublic)
        AddImportFindings(node, findings)
        AddExpressionBodyFinding(node, source, strict, findings)
        AddAccessorFinding(node, source, findings)
        AddOperatorSpacingFinding(node, source, findings)
        for child in node.GetChildren() {
            Walk(child, source, strict, nonWhitespaceTokens, findings, isEffectivelyPublic)
        }
    }

    private func AddAliasFindings(node SyntaxNode, findings List[Finding]) {
        switch node {
            case declaration is FunctionDeclarationSyntax when IsPublic(declaration.AccessibilityModifier) {
                for parameter in declaration.Parameters {
                    AddAliasFindings(parameter.Type, findings)
                }
                AddAliasFindings(declaration.Type, findings)
            }
            case declaration is FieldDeclarationSyntax when IsPublic(declaration.AccessibilityModifier) {
                AddAliasFindings(declaration.Type, findings)
            }
            case declaration is PropertyDeclarationSyntax when IsPublic(declaration.AccessibilityModifier) {
                AddAliasFindings(declaration.Type, findings)
                for parameter in declaration.Parameters {
                    AddAliasFindings(parameter.Type, findings)
                }
            }
            case declaration is VariableDeclarationSyntax when IsPublic(declaration.AccessibilityModifier) {
                AddAliasFindings(declaration.TypeClause, findings)
            }
            case declaration is DelegateDeclarationSyntax when IsPublic(declaration.AccessibilityModifier) {
                for parameter in declaration.Parameters {
                    AddAliasFindings(parameter.Type, findings)
                }
                AddAliasFindings(declaration.ReturnType, findings)
            }
        }
    }

    private func AddAliasFindings(type TypeClauseSyntax?, findings List[Finding]) {
        for token in FindAliasTokens(type) {
            let canonical = TypeAliases[token.Text]
            findings.Add(
                Finding(
                    AliasRule,
                    "warning",
                    token.Location,
                    "public API uses alias '${token.Text}'; prefer canonical '$canonical'"
                )
            )
        }
    }

    private func FindAliasTokens(type TypeClauseSyntax?) sequence[SyntaxToken] {
        if type == nil {
            yield break
        }
        if !type.HasQualifier && type.Identifier != nil && TypeAliases.ContainsKey(type.Identifier!!.Text) {
            yield type.Identifier!!
        }
        for token in FindAliasTokens(type.ArrayElementType) {
            yield token
        }
        for token in FindAliasTokens(type.ReturnTypeClause) {
            yield token
        }
        for token in FindAliasTokens(type.MapKeyType) {
            yield token
        }
        for token in FindAliasTokens(type.MapValueType) {
            yield token
        }
        for token in FindAliasTokens(type.ChanElementType) {
            yield token
        }
        for token in FindAliasTokens(type.PointerPointeeType) {
            yield token
        }
        for token in FindAliasTokens(type.SequenceElementType) {
            yield token
        }
        if type.TypeArguments != nil {
            for argument in type.TypeArguments!! {
                for token in FindAliasTokens(argument) {
                    yield token
                }
            }
        }
        if type.TupleElements != nil {
            for element in type.TupleElements!! {
                for token in FindAliasTokens(element) {
                    yield token
                }
            }
        }
        if type.FunctionParameterTypes != nil {
            for parameter in type.FunctionParameterTypes!! {
                for token in FindAliasTokens(parameter) {
                    yield token
                }
            }
        }
    }

    private func AddInferredTypeFinding(node SyntaxNode, findings List[Finding]) {
        if node is not VariableDeclarationSyntax{TypeClause: nil, Initializer: not nil} declaration ||
            !IsPublic(declaration.AccessibilityModifier) {
            return
        }
        findings.Add(
            Finding(
                InferredTypeRule,
                "warning",
                declaration.Identifier.Location,
                "public binding '${declaration.Identifier.Text}' has no explicit type clause; its type is inferred from the initializer"
            )
        )
    }

    private func AddVarFindings(node SyntaxNode, strict bool, findings List[Finding]) {
        switch node {
            case compilationUnit is CompilationUnitSyntax {
                let topLevelStatements = List[SyntaxNode]()
                for member in compilationUnit.Members {
                    if member is GlobalStatementSyntax{Statement: not nil} global {
                        topLevelStatements.Add(global.Statement)
                    }
                }
                AnalyzeVarScope(topLevelStatements, strict, findings)
            }
            case FunctionDeclarationSyntax{Body: not nil} function {
                AnalyzeVarScope([]SyntaxNode{function.Body!!}, strict, findings)
            }
            case ConstructorDeclarationSyntax{Body: not nil} constructor {
                AnalyzeVarScope([]SyntaxNode{constructor.Body}, strict, findings)
            }
        }
        for child in node.GetChildren() {
            AddVarFindings(child, strict, findings)
        }
    }

    private func AnalyzeVarScope(roots IEnumerable[SyntaxNode], strict bool, findings List[Finding]) {
        let declarations = List[VariableDeclarationSyntax]()
        let nameCounts = Dictionary[string, int32](StringComparer.Ordinal)
        let reassigned = HashSet[string](StringComparer.Ordinal)
        for root in roots {
            CollectVarState(root, declarations, nameCounts, reassigned)
        }
        for declaration in declarations {
            let name = declaration.Identifier.Text
            if nameCounts.GetValueOrDefault(name) > 1 || reassigned.Contains(name) {
                continue
            }
            findings.Add(
                Finding(
                    VarRule,
                    if strict {
                        "warning"
                    } else {
                        "info"
                    },
                    declaration.Identifier.Location,
                    "'$name' is declared with 'var' but never reassigned; consider 'let'"
                )
            )
        }
    }

    private func CollectVarState(
        node SyntaxNode,
        declarations List[VariableDeclarationSyntax],
        nameCounts Dictionary[string, int32],
        reassigned HashSet[string]
    ) {
        switch node {
            case FunctionDeclarationSyntax, ConstructorDeclarationSyntax {
                return
            }
            case declaration is VariableDeclarationSyntax {
                nameCounts[declaration.Identifier.Text] = nameCounts.GetValueOrDefault(declaration.Identifier.Text) + 1
                if declaration.Keyword?.Kind == SyntaxKind.VarKeyword && declaration.Initializer != nil {
                    declarations.Add(declaration)
                }
            }
            case AccessorExpressionSyntax{LeftPart: NameExpressionSyntax receiver, RightPart: CallExpressionSyntax} {
                reassigned.Add(receiver.IdentifierToken.Text)
            }
            case assignment is AssignmentExpressionSyntax {
                reassigned.Add(assignment.IdentifierToken.Text)
            }
            case assignment is FieldAssignmentExpressionSyntax {
                reassigned.Add(assignment.Receiver.Text)
            }
            case assignment is MemberFieldAssignmentExpressionSyntax {
                AddRootName(assignment.Receiver, reassigned)
            }
            case assignment is MultiAssignmentStatementSyntax {
                for target in assignment.Targets {
                    if target is NameExpressionSyntax name {
                        reassigned.Add(name.IdentifierToken.Text)
                    }
                }
            }
            case assignment is IndexAssignmentExpressionSyntax {
                reassigned.Add(assignment.TargetIdentifier.Text)
            }
            case assignment is MemberIndexAssignmentExpressionSyntax {
                AddRootName(assignment.Target.Target, reassigned)
            }
            case assignment is CompoundIndexAssignmentExpressionSyntax {
                AddRootName(assignment.Target.Target, reassigned)
            }
            case subscription is EventSubscriptionExpressionSyntax {
                AddRootName(subscription.LeftHandSide, reassigned)
            }
            case assignment is NullCoalescingAssignmentStatementSyntax {
                AddRootName(assignment.Target, reassigned)
            }
            case RefArgumentExpressionSyntax{Expression: NameExpressionSyntax name} {
                reassigned.Add(name.IdentifierToken.Text)
            }
            case UnaryExpressionSyntax{
                OperatorToken: {Kind: SyntaxKind.PlusPlusToken or SyntaxKind.MinusMinusToken},
                Operand: NameExpressionSyntax name
            } {
                reassigned.Add(name.IdentifierToken.Text)
            }
            case UnaryExpressionSyntax{
                OperatorToken: {Kind: SyntaxKind.AmpersandToken},
                Operand: NameExpressionSyntax name
            } {
                reassigned.Add(name.IdentifierToken.Text)
            }
        }
        for child in node.GetChildren() {
            CollectVarState(child, declarations, nameCounts, reassigned)
        }
    }

    private func AddRootName(expression ExpressionSyntax, reassigned HashSet[string]) {
        switch expression {
            case name is NameExpressionSyntax {
                reassigned.Add(name.IdentifierToken.Text)
            }
            case accessor is AccessorExpressionSyntax {
                AddRootName(accessor.LeftPart, reassigned)
            }
            case index is IndexExpressionSyntax {
                AddRootName(index.Target, reassigned)
            }
            case parenthesized is ParenthesizedExpressionSyntax {
                AddRootName(parenthesized.Expression, reassigned)
            }
        }
    }

    private func AddPublicDocFinding(
        node SyntaxNode,
        strict bool,
        nonWhitespaceTokens List[SyntaxToken],
        findings List[Finding],
        isEffectivelyPublic bool
    ) {
        let (isPublic, kind, name, location) = switch node {
            case declaration is FunctionDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                "func",
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            case declaration is StructDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                if declaration.IsClass {
                    "class"
                } else {
                    "struct"
                },
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            case declaration is EnumDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                "enum",
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            case declaration is InterfaceDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                "interface",
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            case declaration is DelegateDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                "delegate",
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            case declaration is PropertyDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                "property",
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            case declaration is FieldDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                "field",
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            case declaration is EventDeclarationSyntax: (
                IsPublic(declaration.AccessibilityModifier),
                "event",
                declaration.Identifier.Text,
                declaration.Identifier.Location
            )
            default: (false, string.Empty, string.Empty, default(TextLocation))
        }
        if !isPublic || !isEffectivelyPublic {
            return
        }
        let previousIndex = nonWhitespaceTokens.FindLastIndex((token SyntaxToken) -> token.Position < node.Span.Start)
        if previousIndex >= 0 && nonWhitespaceTokens[previousIndex].Kind == SyntaxKind.DocumentationCommentToken {
            return
        }
        findings.Add(
            Finding(
                PublicDocRule,
                if strict {
                    "warning"
                } else {
                    "info"
                },
                location,
                "public $kind '$name' has no leading /// documentation comment"
            )
        )
    }

    private func AddImportFindings(node SyntaxNode, findings List[Finding]) {
        if node is not CompilationUnitSyntax compilationUnit {
            return
        }
        let seen = HashSet[string](StringComparer.Ordinal)
        for member in compilationUnit.Members {
            if member is not ImportSyntax import_ {
                continue
            }
            let path = string.Join('.', import_.Identifiers.Select((token SyntaxToken) -> token.Text))
            if !seen.Add(path) {
                findings.Add(Finding(ImportRule, "warning", import_.Location, "duplicate import '$path'"))
            }
        }
    }

    private func AddExpressionBodyFinding(node SyntaxNode, source string, strict bool, findings List[Finding]) {
        if !(node is FunctionDeclarationSyntax{Body: {} body} function) ||
            function.IsRefReturn ||
            body
            .OpenBraceToken
            .Position >= source.Length ||
            source[body.OpenBraceToken.Position] != '{' ||
            body
            .Statements
            .Length != 1 ||
            body.Statements[0] is not(ReturnStatementSyntax and {Expression: not nil, IsRefReturn: false}) {
            return
        }
        findings.Add(
            Finding(
                ExpressionBodyRule,
                if strict {
                    "warning"
                } else {
                    "info"
                },
                function.Location,
                "prefer an expression body: -> expr"
            )
        )
    }

    private func AddAccessorFinding(node SyntaxNode, source string, findings List[Finding]) {
        if !(node is PropertyAccessorSyntax{Body: {} body} accessor) ||
            body
            .Statements
            .Length != 1 ||
            !HasSingleExpression(accessor, body) ||
            body
            .OpenBraceToken
            .Position < 0 ||
            body
            .CloseBraceToken
            .Position < body
            .OpenBraceToken
            .Position ||
            body
            .CloseBraceToken
            .Position >= source.Length ||
            source[body.OpenBraceToken.Position] != '{' ||
            source[body.CloseBraceToken.Position] != '}' ||
            source
            .AsSpan(body.OpenBraceToken.Position, body.CloseBraceToken.Position - body.OpenBraceToken.Position + 1)
            .IndexOfAny('\r', '\n') >= 0 {
            return
        }
        findings.Add(
            Finding(
                AccessorRule,
                "warning",
                accessor.Location,
                "prefer an expression-bodied accessor: accessor -> expr"
            )
        )
    }

    private func AddOperatorSpacingFinding(node SyntaxNode, source string, findings List[Finding]) {
        if node is not FunctionDeclarationSyntax function {
            return
        }
        let start = function.Identifier.Position
        let openParenthesis = function.OpenParenthesisToken.Position
        if start < 0 || openParenthesis <= start || openParenthesis >= source.Length || !source.AsSpan(
            start,
            openParenthesis - start
        )
            .StartsWith("operator ", StringComparison.Ordinal) || char.IsWhiteSpace(source[openParenthesis - 1]) ||
            char.IsLetter(source[openParenthesis - 1]) {
            return
        }
        findings.Add(
            Finding(
                OperatorSpacingRule,
                "warning",
                function.Location,
                "put a space between the operator and parameter list"
            )
        )
    }

    private func HasSingleExpression(
        accessor PropertyAccessorSyntax,
        body BlockStatementSyntax
    ) bool -> if accessor.IsGetter {
        (body.Statements[0] is ReturnStatementSyntax and {Expression: not nil, IsRefReturn: false})
    } else {
        accessor.IsSetterOrInit && body.Statements[0] is ExpressionStatementSyntax
    }

    private func IsPublic(modifier SyntaxToken?) bool -> modifier != nil && modifier.Kind == SyntaxKind.PublicKeyword

    private func FirstDifference(source string, formatted string) int32 {
        let max = Math.Min(source.Length, formatted.Length)
        var index = 0
        while (index < max && source[index] == formatted[index]) {
            index++
        }
        return if source.Length == 0 {
            0
        } else {
            Math.Min(index, source.Length - 1)
        }
    }

    private func HasRelativeReparsePoint(path string) bool {
        if Path.IsPathRooted(path) {
            return false
        }
        for var component = Path.TrimEndingDirectorySeparator(path); !string.IsNullOrEmpty(component);
            component = Path.GetDirectoryName(component)!! {
            if Path.GetFileName(component) is not("." or "..") &&
                (File.GetAttributes(component) & FileAttributes.ReparsePoint) != 0 {
                return true
            }
        }
        return false
    }

    private func DiscoverFiles(paths IEnumerable[string]) IReadOnlyList[string] {
        let result = HashSet[string](StringComparer.Ordinal)
        for path in paths {
            if HasRelativeReparsePoint(path) {
                Console.Error.WriteLine("gslint: warning: skipping path through a symlink or reparse point: $path")
                continue
            }
            if File.Exists(path) {
                if Path.GetExtension(path) == ".gs" && (File.GetAttributes(path) & FileAttributes.ReparsePoint) == 0 {
                    result.Add(Path.GetFullPath(path))
                }
                continue
            }
            if !Directory.Exists(path) {
                throw DirectoryNotFoundException("path not found: $path")
            }
            WalkDirectory(path, result)
        }
        return result.OrderBy((path string) -> path, StringComparer.Ordinal).ToList()
    }

    private func WalkDirectory(directory string, result HashSet[string]) {
        if (File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0 {
            return
        }
        for file in Directory.EnumerateFiles(directory, "*.gs").OrderBy((path string) -> path, StringComparer.Ordinal) {
            if (File.GetAttributes(file) & FileAttributes.ReparsePoint) == 0 {
                result.Add(Path.GetFullPath(file))
            }
        }
        for subdirectory in Directory.EnumerateDirectories(directory).OrderBy(
            (path string) -> path,
            StringComparer.Ordinal
        ) {
            let name = Path.GetFileName(subdirectory)
            if (name is "bin" or "obj") || name.StartsWith('.') {
                continue
            }
            WalkDirectory(subdirectory, result)
        }
    }

    private func PrintFinding(finding Finding) {
        let file = finding.Location.FileName ?? string.Empty
        Console.WriteLine(
            "$file(${finding.Location.StartLine + 1},${finding.Location.StartCharacter + 1}): " +
                "${finding.Severity} ${finding.Rule}: ${finding.Message}"
        )
    }

    private func PrintDiagnostic(diagnostic Diagnostic) {
        if diagnostic.Location.Text == nil {
            Console.WriteLine("${diagnostic.Id}: ${diagnostic.Message}")
            return
        }
        let severity = switch diagnostic.Severity {
            case DiagnosticSeverity.Error: "error"
            case DiagnosticSeverity.Warning: "warning"
            default: "info"
        }
        Console.WriteLine(
            "${diagnostic.Location.FileName}(${diagnostic.Location.StartLine + 1},${diagnostic.Location.StartCharacter + 1}): " +
                "$severity ${diagnostic.Id}: ${diagnostic.Message}"
        )
    }
}
