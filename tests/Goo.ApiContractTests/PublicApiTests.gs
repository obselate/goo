import Goo
import Goo.Printing
import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Linq
import System.Reflection
import PEReaderExtensions = System.Reflection.Metadata.PEReaderExtensions
import System.Reflection.PortableExecutable
import System.Runtime.CompilerServices
import System.Text
import System.Threading
import System.Threading.Tasks
import Xunit

open class PublicApiTests {
    @Fact
    func PublicSurfaceMatchesApprovedBaseline() {
        let actual = DescribePublicSurface()
        if Environment.GetEnvironmentVariable("GOO_UPDATE_PUBLIC_API_BASELINE") == "1" {
            File.WriteAllText(FindSourceBaseline(), actual, UTF8Encoding(false))
            return
        }
        let path = Path.Combine(AppContext.BaseDirectory, "PublicApi.approved.txt")
        Assert.True(File.Exists(path), "Missing approved public API baseline at $path.")
        let approved = File.ReadAllText(path)
        Assert.DoesNotContain('\r', approved)
        Assert.True(approved.EndsWith('\n'), "The approved public API baseline must end with LF.")
        let lines = approved[.. ^1].Split('\n')
        Assert.DoesNotContain(lines, string.IsNullOrWhiteSpace)
        Assert.Equal(lines.Order(StringComparer.Ordinal), lines)
        Assert.Equal(lines.Distinct(StringComparer.Ordinal), lines)
        Assert.Equal(approved, actual)
    }

    @Fact
    func PublicSignaturesDoNotLeakSubstrate() {
        let gooAssembly = typeof(Window).Assembly
        let violations = ApiTypes()
            .SelectMany(PublicSignatureTypes)
            .SelectMany(
            (entry(Location string, Type Type)) -> Flatten(entry.Type).Select(
                (type Type) -> (entry.Location, Type: type)
            )
        )
            .Where((entry(Location string, Type Type)) -> IsForbiddenSignatureType(entry.Item2, gooAssembly))
            .Select((entry(Location string, Type Type)) -> "${entry.Item1} -> ${TypeIdentity(entry.Item2)}")
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray()
        Assert.Empty(violations)
    }

    @Fact
    func BlobIsAClosedFrameworkHierarchy() {
        let blob = typeof(Blob)
        Assert.True(blob.IsAbstract)
        let gate = Assert.Single(
            blob.GetMethods(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly),
            (method MethodInfo) -> method.Name == "coreBlob"
        )
        Assert.True(gate.IsAssembly)
        Assert.True(gate.IsAbstract)
        Assert.True(gate.IsVirtual)
        let concreteBlobs = ApiTypes().Where((type Type) -> type != blob && blob.IsAssignableFrom(type)).ToArray()
        Assert.NotEmpty(concreteBlobs)
        Assert.All(concreteBlobs, (type Type) -> Assert.True(type.IsSealed, type.FullName))
    }

    @Fact
    func TextDecorationIsAFlagsEnum() {
        Assert.True(typeof(TextDecoration).IsDefined(typeof(FlagsAttribute), false))
    }

    @Fact
    async func OmittedPrintResolutionUsesTheDefault() Task {
        using let output = MemoryStream()
        let settings = PrintPageSettings{WidthPoints: 72.0, HeightPoints: 72.0}
        let result = await Printing.ExportPdfAsync(Window{}, CancelledPrintDocument{}, settings,
            output, CancellationToken(true))
        Assert.Equal(PrintStatus.Cancelled, result.Status)
    }

    private class CancelledPrintDocument : IPrintDocument {
        public func Paginate(settings PrintPageSettings) PrintLayoutResult ->
            PrintLayoutResult{Status: PrintLayoutStatus.Ready, PageCount: 1}
        public func CreatePage(index int32, settings PrintPageSettings) Cell {
            throw InvalidOperationException("A cancelled export must not create pages.")
        }
    }

    shared {
        private const PublicDeclared BindingFlags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly
        private const ProtectedDeclared BindingFlags = BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly
        private let Nullability NullabilityInfoContext = NullabilityInfoContext()
        private let ForbiddenNamespaceRoots[]string = []string{
            "Facebook.Yoga",
            "GLFW",
            "Goo.InternalTextInterop",
            "HarfBuzzSharp",
            "Hexa.NET",
            "SDL2",
            "Silk.NET",
            "SkiaSharp"
        }

        private func DescribePublicSurface() string {
            let records = ApiTypes().SelectMany(DescribeType).ToList()
            let android = Path.GetFullPath(Path.Combine(
                Path.GetDirectoryName(FindSourceBaseline())!!, "../../Goo.Android/bin/Release/net10.0-android/Goo.Android.dll"
            ))
            using let stream = File.OpenRead(android)
            using let pe = PEReader(stream)
            let metadata = PEReaderExtensions.GetMetadataReader(pe)
            for handle in metadata.TypeDefinitions {
                var type = metadata.GetTypeDefinition(handle)
                var name = metadata.GetString(type.Name)
                while (type.Attributes & TypeAttributes.VisibilityMask) == TypeAttributes.NestedPublic {
                    type = metadata.GetTypeDefinition(type.GetDeclaringType())
                    name = metadata.GetString(type.Name) + "+" + name
                }
                if (type.Attributes & TypeAttributes.VisibilityMask) == TypeAttributes.Public {
                    records.Add("android-type|${metadata.GetString(type.Namespace)}.$name")
                }
            }
            let autoKeyOwners = typeof(Window)
                .Assembly
                .GetTypes()
                .Where(IsPackageContainer)
                .Where((type Type) -> type.GetMember("AutoKey", PublicDeclared).Length > 0)
                .Select(Owner)
                .Order(StringComparer.Ordinal)
                .ToArray()
            records.Add(
                if autoKeyOwners.Length == 0 {
                    "absent|generated-package-containers|member|AutoKey"
                } else {
                    "present|generated-package-containers|member|AutoKey|owners:${string.Join(",", autoKeyOwners)}"
                }
            )
            let packageMethods = typeof(Window)
                .Assembly
                .GetTypes()
                .Where(IsPackageContainer)
                .SelectMany((type Type) -> type.GetMethods(PublicDeclared))
            for name in[]string{"Percent"} {
                let method = Assert.Single(packageMethods, (method MethodInfo) -> method.Name == name)
                records.Add(
                    "function|Goo|$name|${PublicApiTests.Visibility(method)}|generic:${DescribeGenericParameters(method.GetGenericArguments())}|(${DescribeParameters(method.GetParameters())})->${TypeIdentity(method.ReturnType, Nullability.Create(method.ReturnParameter))}"
                )
            }
            let duplicates = records
                .GroupBy((record string) -> record, StringComparer.Ordinal)
                .Where((group IGrouping[string, string]) -> group.Count() > 1)
                .Select((group IGrouping[string, string]) -> group.Key)
                .Order(StringComparer.Ordinal)
                .ToArray()
            Assert.Empty(duplicates)
            records.Sort(StringComparer.Ordinal)
            return string.Join('\n', records) + "\n"
        }

        private func ApiTypes() IEnumerable[Type] -> []Assembly{
            typeof(Window).Assembly,
            typeof(SoundPlayer).Assembly
        }
            .SelectMany((assembly Assembly) -> assembly.GetExportedTypes())
            .Where((type Type) -> !IsPackageContainer(type))
            .Where((type Type) -> !IsTestFixture(type))
            .OrderBy((type Type) -> type.FullName, StringComparer.Ordinal)

        private func DescribeType(type Type) sequence[string] {
            let owner = Owner(type)
            let baseType = if type.BaseType == nil {
                "-"
            } else {
                TypeIdentity(type.BaseType!!)
            }
            let inheritedInterfaces = type.BaseType?.GetInterfaces() ?? Type.EmptyTypes
            let interfaces = string.Join(
                ",",
                type.GetInterfaces().Except(inheritedInterfaces).Select(TypeIdentity).Order(StringComparer.Ordinal)
            )
            yield "type|$owner|${TypeKind(type)}|${PublicApiTests.Visibility(type)}|base:$baseType|interfaces:$interfaces|generic:${DescribeGenericParameters(type.GetGenericArguments())}"
            if type.IsEnum {
                let underlying = Enum.GetUnderlyingType(type)
                yield "enum-underlying|$owner|${TypeIdentity(underlying)}"
                for name in Enum.GetNames(type) {
                    let value = Enum.Parse(type, name)
                    let numeric = Convert.ChangeType(value, underlying, CultureInfo.InvariantCulture)
                    yield "enum|$owner|$name|${Convert.ToString(numeric, CultureInfo.InvariantCulture)}"
                }
            }
            for constructor in type.GetConstructors(PublicDeclared) {
                yield "ctor|$owner|${PublicApiTests.Visibility(constructor)}|(${DescribeParameters(constructor.GetParameters())})"
            }
            var properties = type.GetProperties(PublicDeclared).AsEnumerable()
            if type == typeof(Cell[_]) {
                properties = properties.Concat(
                    type.GetProperties(ProtectedDeclared).Where((property PropertyInfo) -> property.Name == "Input")
                )
            }
            for property in properties {
                let accessor = property.GetMethod ?? property.SetMethod!!
                yield "property|$owner|${property.Name}|${TypeIdentity(property.PropertyType, Nullability.Create(property))}|${Scope(accessor)}|${PropertyAccess(property)}|index:(${DescribeParameters(property.GetIndexParameters())})"
            }
            if !type.IsEnum {
                for field in type.GetFields(PublicDeclared) {
                    let mutability = if field.IsLiteral {
                        "const"
                    } else {
                        (
                            if field.IsInitOnly {
                                "readonly"
                            } else {
                                "mutable"
                            }
                        )
                    }
                    let value = if field.IsLiteral {
                        "|value:${FormatValue(field.GetRawConstantValue())}"
                    } else {
                        ""
                    }
                    yield "field|$owner|${field.Name}|${TypeIdentity(field.FieldType, Nullability.Create(field))}|${(if field.IsStatic { "static" } else { "instance" })}|${PublicApiTests.Visibility(field)}|$mutability$value"
                }
            }
            for event in type.GetEvents(PublicDeclared) {
                let accessor = event.AddMethod ?? event.RemoveMethod!!
                yield "event|$owner|${event.Name}|${TypeIdentity(event.EventHandlerType!!, Nullability.Create(event))}|${Scope(accessor)}|${EventAccess(event)}"
            }
            let accessors = properties
                .SelectMany((property PropertyInfo) -> []MethodInfo? {property.GetMethod, property.SetMethod})
                .Concat(
                type.GetEvents(PublicDeclared).SelectMany(
                    (event EventInfo) -> []MethodInfo? {event.AddMethod, event.RemoveMethod}
                )
            )
                .Where((method MethodInfo?) -> method != nil)
                .ToHashSet()
            var methods = type
                .GetMethods(PublicDeclared)
                .Where((method MethodInfo) -> !accessors.Contains(method))
                .Where(
                (method MethodInfo) -> !method.IsSpecialName || method.Name.StartsWith("op_", StringComparison.Ordinal)
            )
            if type == typeof(Cell[_]) {
                methods = methods.Concat(
                    type.GetMethods(ProtectedDeclared).Where(
                        (method MethodInfo) -> (method.Name is "Build" or "ShouldRebuild")
                    )
                )
            }
            for method in methods {
                yield "method|$owner|${method.Name}|${Scope(method)}|${PublicApiTests.Visibility(method)}|generic:${DescribeGenericParameters(method.GetGenericArguments())}|(${DescribeParameters(method.GetParameters())})->${TypeIdentity(method.ReturnType, Nullability.Create(method.ReturnParameter))}"
            }
        }

        private func DescribeParameters(parameters IEnumerable[ParameterInfo]) string -> string.Join(
            ",",
            parameters.Select(DescribeParameter)
        )

        private func DescribeParameter(parameter ParameterInfo) string {
            let modifier = if parameter.GetCustomAttribute[ParamArrayAttribute]() != nil {
                "params "
            } else {
                (
                    if parameter.IsOut {
                        "out "
                    } else {
                        (
                            if parameter.ParameterType.IsByRef && parameter.IsIn {
                                "in "
                            } else {
                                (
                                    if parameter.ParameterType.IsByRef {
                                        "ref "
                                    } else {
                                        ""
                                    }
                                )
                            }
                        )
                    }
                )
            }
            let optional = if parameter.HasDefaultValue {
                "=${FormatValue(parameter.DefaultValue)}"
            } else {
                ""
            }
            let name = parameter.Name ?? "arg${parameter.Position}"
            return "$modifier$name:${TypeIdentity(parameter.ParameterType, Nullability.Create(parameter))}$optional"
        }

        private func DescribeGenericParameters(parameters IEnumerable[Type]) string -> string.Join(
            ";",
            parameters.Select(
                (parameter Type) -> {
                    let constraints = string.Join(
                        "&",
                        parameter.GetGenericParameterConstraints().Select(TypeIdentity).Order(StringComparer.Ordinal)
                    )
                    return "${parameter.Name}[attrs:${int32(parameter.GenericParameterAttributes)},constraints:$constraints]"
                }
            )
        )

        private func PropertyAccess(property PropertyInfo) string {
            let accessors = List[string]()
            if property.GetMethod != nil {
                accessors.Add("get:${PublicApiTests.Visibility(property.GetMethod!!)}")
            }
            if property.SetMethod != nil {
                let operation = if IsInitOnly(property.SetMethod!!) {
                    "init"
                } else {
                    "set"
                }
                accessors.Add("$operation:${PublicApiTests.Visibility(property.SetMethod!!)}")
            }
            return string.Join(",", accessors)
        }

        private func EventAccess(event EventInfo) string {
            let accessors = List[string]()
            if event.AddMethod != nil {
                accessors.Add("add:${PublicApiTests.Visibility(event.AddMethod!!)}")
            }
            if event.RemoveMethod != nil {
                accessors.Add("remove:${PublicApiTests.Visibility(event.RemoveMethod!!)}")
            }
            return string.Join(",", accessors)
        }

        private func TypeKind(type Type) string {
            if type.IsInterface {
                return "interface"
            }
            if type.IsEnum {
                return "enum"
            }
            if type.BaseType == typeof(MulticastDelegate) {
                return "delegate"
            }
            if type.IsValueType {
                return "struct"
            }
            if type.IsAbstract && type.IsSealed {
                return "static-class"
            }
            if type.IsAbstract {
                return "abstract-class"
            }
            return if type.IsSealed {
                "sealed-class"
            } else {
                "class"
            }
        }

        private func Scope(method MethodBase) string {
            if method.IsStatic {
                return "static"
            }
            if method.IsAbstract {
                return "abstract"
            }
            return if method.IsVirtual && !method.IsFinal {
                "virtual"
            } else {
                "instance"
            }
        }

        private func TypeIdentity(type Type) string -> TypeIdentity(type, nil)

        private func TypeIdentity(type Type, nullability NullabilityInfo?) string {
            let nullable = if !type.IsValueType &&
                (
                nullability?.ReadState == NullabilityState.Nullable ||
                    nullability?.WriteState == NullabilityState.Nullable
            ) {
                "?"
            } else {
                ""
            }
            if type.IsGenericParameter {
                return "${(if type.DeclaringMethod == nil { "!" } else { "!!" })}${type.GenericParameterPosition}$nullable"
            }
            if type.IsByRef {
                return "${TypeIdentity(type.GetElementType()!!, nullability)}&"
            }
            if type.IsPointer {
                return "${TypeIdentity(type.GetElementType()!!)}*"
            }
            if type.IsArray {
                let rank = type.GetArrayRank()
                return "${TypeIdentity(type.GetElementType()!!, nullability?.ElementType)}[${String(',', rank - 1)}]$nullable"
            }
            if type.IsGenericType {
                let definition = type.GetGenericTypeDefinition()
                let arguments = type.GetGenericArguments().Select(
                    (argument Type, index int32) -> TypeIdentity(
                        argument,
                        if nullability != nil && index < nullability.GenericTypeArguments.Length {
                            nullability.GenericTypeArguments[index]
                        } else {
                            default(NullabilityInfo?)
                        }
                    )
                )
                return "${definition.FullName}<${string.Join(",", arguments)}>$nullable"
            }
            return (type.FullName ?? type.Name) + nullable
        }

        private func PublicSignatureTypes(type Type) sequence[(Location string, Type Type)] {
            let owner = Owner(type)
            if type.BaseType != nil {
                yield("$owner base", type.BaseType!!)
            }
            for interface_ in type.GetInterfaces() {
                yield("$owner interface", interface_)
            }
            for constraint in type.GetGenericArguments().SelectMany(
                (parameter Type) -> parameter.GetGenericParameterConstraints()
            ) {
                yield("$owner generic constraint", constraint)
            }
            for constructor in type.GetConstructors(PublicDeclared) {
                for parameter in constructor.GetParameters() {
                    yield("$owner constructor parameter ${parameter.Name}", parameter.ParameterType)
                }
            }
            for method in type.GetMethods(PublicDeclared) {
                yield("$owner.${method.Name} return", method.ReturnType)
                for parameter in method.GetParameters() {
                    yield("$owner.${method.Name} parameter ${parameter.Name}", parameter.ParameterType)
                }
                for constraint in method.GetGenericArguments().SelectMany(
                    (parameter Type) -> parameter.GetGenericParameterConstraints()
                ) {
                    yield("$owner.${method.Name} generic constraint", constraint)
                }
            }
            for property in type.GetProperties(PublicDeclared) {
                yield("$owner.${property.Name} property", property.PropertyType)
                for parameter in property.GetIndexParameters() {
                    yield("$owner.${property.Name} index parameter ${parameter.Name}", parameter.ParameterType)
                }
            }
            for field in type.GetFields(PublicDeclared) {
                yield("$owner.${field.Name} field", field.FieldType)
            }
            for event in type.GetEvents(PublicDeclared) {
                yield("$owner.${event.Name} event", event.EventHandlerType!!)
            }
        }

        private func Flatten(type Type) sequence[Type] {
            if type.IsGenericParameter {
                yield break
            }
            if type.IsArray || type.IsByRef || type.IsPointer {
                for element in Flatten(type.GetElementType()!!) {
                    yield element
                }
                yield break
            }
            yield type
            if type.IsGenericType {
                for argument in type.GetGenericArguments() {
                    for nested in Flatten(argument) {
                        yield nested
                    }
                }
            }
        }

        private func IsForbiddenSignatureType(type Type, gooAssembly Assembly) bool {
            if (type.Assembly == gooAssembly || type.Assembly == typeof(SoundPlayer).Assembly) &&
                !IsPubliclyVisible(type) {
                return true
            }
            let typeNamespace string? = type.Namespace
            return typeNamespace != nil && ForbiddenNamespaceRoots.Any(
                (root string) -> typeNamespace.Equals(root, StringComparison.Ordinal) || typeNamespace.StartsWith(
                    root + ".",
                    StringComparison.Ordinal
                )
            )
        }

        private func IsPubliclyVisible(type Type) bool {
            var type = type
            if type.IsGenericType && !type.IsGenericTypeDefinition {
                type = type.GetGenericTypeDefinition()
            }
            return if type.IsPublic {
                true
            } else {
                type.IsNestedPublic && type.DeclaringType != nil && IsPubliclyVisible(type.DeclaringType!!)
            }
        }

        private func FormatValue(value object?) string -> switch value {
            case nil: "null"
            case text is string: "\"${Escape(text)}\""
            case character is char: "'${Escape(character.ToString())}'"
            case flag is bool: if flag {
                "true"
            } else {
                "false"
            }
            default: Escape(Convert.ToString(value, CultureInfo.InvariantCulture) ?? "")
        }

        private func Escape(value string) string -> value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal)
            .Replace("|", "\\|", StringComparison.Ordinal)
            .Replace(",", "\\,", StringComparison.Ordinal)

        private func Visibility(type Type) string {
            if type.IsPublic || type.IsNestedPublic {
                return "public"
            }
            if type.IsNestedFamily {
                return "protected"
            }
            return if type.IsNestedFamORAssem {
                "protected-internal"
            } else {
                "internal"
            }
        }

        private func Visibility(method MethodBase) string {
            if method.IsPublic {
                return "public"
            }
            if method.IsFamily {
                return "protected"
            }
            if method.IsFamilyOrAssembly {
                return "protected-internal"
            }
            return if method.IsAssembly {
                "internal"
            } else {
                "private"
            }
        }

        private func Visibility(field FieldInfo) string {
            if field.IsPublic {
                return "public"
            }
            if field.IsFamily {
                return "protected"
            }
            if field.IsFamilyOrAssembly {
                return "protected-internal"
            }
            return if field.IsAssembly {
                "internal"
            } else {
                "private"
            }
        }

        private func IsInitOnly(setter MethodInfo) bool -> setter
            .ReturnParameter
            .GetRequiredCustomModifiers()
            .Contains(typeof(IsExternalInit))

        private func IsPackageContainer(type Type) bool -> type.Name == "<Program>"

        private func IsTestFixture(type Type) bool -> type.FullName == "Goo.PerformanceFixtures"

        private func Owner(type Type) string -> type.FullName ?? type.Name

        private func FindSourceBaseline() string {
            for start in[]string{Directory.GetCurrentDirectory(), AppContext.BaseDirectory} {
                for var directory DirectoryInfo? = DirectoryInfo(start);
                    directory != nil;
                    directory = directory!!
                    .Parent {
                    let project = Path.Combine(
                        directory.FullName,
                        "tests",
                        "Goo.ApiContractTests",
                        "Goo.ApiContractTests.gsproj"
                    )
                    if File.Exists(project) {
                        return Path.Combine(
                            directory.FullName,
                            "tests",
                            "Goo.ApiContractTests",
                            "PublicApi.approved.txt"
                        )
                    }
                }
            }
            throw DirectoryNotFoundException("Could not find tests/Goo.ApiContractTests.")
        }
    }
}
