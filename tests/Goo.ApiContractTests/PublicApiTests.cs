using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using Goo;
using Xunit;

public class PublicApiTests
{
    private const BindingFlags PublicDeclared =
        BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
    private const BindingFlags ProtectedDeclared =
        BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly;

    private static readonly string[] ForbiddenNamespaceRoots =
    {
        "Facebook.Yoga",
        "GLFW",
        "Goo.InternalTextInterop",
        "HarfBuzzSharp",
        "Hexa.NET",
        "SDL2",
        "Silk.NET",
        "SkiaSharp",
    };

    [Fact]
    public void PublicSurfaceMatchesApprovedBaseline()
    {
        var actual = DescribePublicSurface();
        if (Environment.GetEnvironmentVariable("GOO_UPDATE_PUBLIC_API_BASELINE") == "1")
        {
            File.WriteAllText(FindSourceBaseline(), actual, new UTF8Encoding(false));
            return;
        }

        var path = Path.Combine(AppContext.BaseDirectory, "PublicApi.approved.txt");
        Assert.True(File.Exists(path), $"Missing approved public API baseline at {path}.");
        var approved = File.ReadAllText(path);
        Assert.DoesNotContain('\r', approved);
        Assert.True(approved.EndsWith('\n'), "The approved public API baseline must end with LF.");

        var lines = approved[..^1].Split('\n');
        Assert.DoesNotContain(lines, string.IsNullOrWhiteSpace);
        Assert.Equal(lines.Order(StringComparer.Ordinal), lines);
        Assert.Equal(lines.Distinct(StringComparer.Ordinal), lines);
        Assert.Equal(approved, actual);
    }

    [Fact]
    public void PublicSignaturesDoNotLeakSubstrate()
    {
        var gooAssembly = typeof(Window).Assembly;
        var violations = ApiTypes()
            .SelectMany(PublicSignatureTypes)
            .SelectMany(entry => Flatten(entry.Type)
                .Select(type => (entry.Location, Type: type)))
            .Where(entry => IsForbiddenSignatureType(entry.Type, gooAssembly))
            .Select(entry => $"{entry.Location} -> {TypeIdentity(entry.Type)}")
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.Empty(violations);
    }

    [Fact]
    public void BlobIsAClosedFrameworkHierarchy()
    {
        var blob = typeof(Blob);
        Assert.True(blob.IsAbstract);

        var gate = Assert.Single(
            blob.GetMethods(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly),
            method => method.Name == "coreBlob");
        Assert.True(gate.IsAssembly);
        Assert.True(gate.IsAbstract);
        Assert.True(gate.IsVirtual);

        var concreteBlobs = ApiTypes()
            .Where(type => type != blob && blob.IsAssignableFrom(type))
            .ToArray();
        Assert.NotEmpty(concreteBlobs);
        Assert.All(concreteBlobs, type => Assert.True(type.IsSealed, type.FullName));
    }

    [Fact]
    public void TextDecorationIsAFlagsEnum()
    {
        Assert.True(typeof(TextDecoration).IsDefined(typeof(FlagsAttribute), false));
    }

    private static string DescribePublicSurface()
    {
        var records = ApiTypes()
            .SelectMany(DescribeType)
            .ToList();

        var autoKeyOwners = typeof(Window).Assembly.GetTypes()
            .Where(IsPackageContainer)
            .Where(type => type.GetMember("AutoKey", PublicDeclared).Length > 0)
            .Select(Owner)
            .Order(StringComparer.Ordinal)
            .ToArray();
        records.Add(autoKeyOwners.Length == 0
            ? "absent|generated-package-containers|member|AutoKey"
            : $"present|generated-package-containers|member|AutoKey|owners:{string.Join(",", autoKeyOwners)}");

        var packageMethods = typeof(Window).Assembly.GetTypes()
            .Where(IsPackageContainer)
            .SelectMany(type => type.GetMethods(PublicDeclared));
        foreach (var name in new[] { "Virtual", "VirtualRows" })
        {
            var method = Assert.Single(packageMethods, method => method.Name == name);
            records.Add($"function|Goo|{name}|{Visibility(method)}|generic:{DescribeGenericParameters(method.GetGenericArguments())}|({DescribeParameters(method.GetParameters())})->{TypeIdentity(method.ReturnType)}");
        }

        var duplicates = records
            .GroupBy(record => record, StringComparer.Ordinal)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Empty(duplicates);

        records.Sort(StringComparer.Ordinal);
        return string.Join('\n', records) + "\n";
    }

    private static IEnumerable<Type> ApiTypes()
    {
        return typeof(Window).Assembly.GetExportedTypes()
            .Where(type => !IsPackageContainer(type))
            .Where(type => !IsTestFixture(type))
            .OrderBy(type => type.FullName, StringComparer.Ordinal);
    }

    private static IEnumerable<string> DescribeType(Type type)
    {
        var owner = Owner(type);
        var baseType = type.BaseType == null ? "-" : TypeIdentity(type.BaseType);
        var inheritedInterfaces = type.BaseType?.GetInterfaces() ?? Type.EmptyTypes;
        var interfaces = string.Join(",", type.GetInterfaces()
            .Except(inheritedInterfaces)
            .Select(TypeIdentity)
            .Order(StringComparer.Ordinal));
        yield return $"type|{owner}|{TypeKind(type)}|{Visibility(type)}|base:{baseType}|interfaces:{interfaces}|generic:{DescribeGenericParameters(type.GetGenericArguments())}";

        if (type.IsEnum)
        {
            var underlying = Enum.GetUnderlyingType(type);
            yield return $"enum-underlying|{owner}|{TypeIdentity(underlying)}";
            foreach (var name in Enum.GetNames(type))
            {
                var value = Enum.Parse(type, name);
                var numeric = Convert.ChangeType(value, underlying, CultureInfo.InvariantCulture);
                yield return $"enum|{owner}|{name}|{Convert.ToString(numeric, CultureInfo.InvariantCulture)}";
            }
        }

        foreach (var constructor in type.GetConstructors(PublicDeclared))
        {
            yield return $"ctor|{owner}|{Visibility(constructor)}|({DescribeParameters(constructor.GetParameters())})";
        }

        var properties = type.GetProperties(PublicDeclared).AsEnumerable();
        if (type == typeof(Cell<>))
        {
            properties = properties.Concat(type.GetProperties(ProtectedDeclared)
                .Where(property => property.Name == "Input"));
        }
        foreach (var property in properties)
        {
            var accessor = property.GetMethod ?? property.SetMethod!;
            yield return $"property|{owner}|{property.Name}|{TypeIdentity(property.PropertyType)}|{Scope(accessor)}|{PropertyAccess(property)}|index:({DescribeParameters(property.GetIndexParameters())})";
        }

        if (!type.IsEnum)
        {
            foreach (var field in type.GetFields(PublicDeclared))
            {
                var mutability = field.IsLiteral ? "const" : field.IsInitOnly ? "readonly" : "mutable";
                var value = field.IsLiteral ? $"|value:{FormatValue(field.GetRawConstantValue())}" : "";
                yield return $"field|{owner}|{field.Name}|{TypeIdentity(field.FieldType)}|{(field.IsStatic ? "static" : "instance")}|{Visibility(field)}|{mutability}{value}";
            }
        }

        foreach (var @event in type.GetEvents(PublicDeclared))
        {
            var accessor = @event.AddMethod ?? @event.RemoveMethod!;
            yield return $"event|{owner}|{@event.Name}|{TypeIdentity(@event.EventHandlerType!)}|{Scope(accessor)}|{EventAccess(@event)}";
        }

        var accessors = properties
            .SelectMany(property => new[] { property.GetMethod, property.SetMethod })
            .Concat(type.GetEvents(PublicDeclared)
                .SelectMany(@event => new[] { @event.AddMethod, @event.RemoveMethod }))
            .Where(method => method != null)
            .ToHashSet();
        var methods = type.GetMethods(PublicDeclared)
            .Where(method => !accessors.Contains(method))
            .Where(method => !method.IsSpecialName
                || method.Name.StartsWith("op_", StringComparison.Ordinal));
        if (type == typeof(Cell<>))
        {
            methods = methods.Concat(type.GetMethods(ProtectedDeclared)
                .Where(method => method.Name is "Build" or "ShouldRebuild"));
        }
        foreach (var method in methods)
        {
            yield return $"method|{owner}|{method.Name}|{Scope(method)}|{Visibility(method)}|generic:{DescribeGenericParameters(method.GetGenericArguments())}|({DescribeParameters(method.GetParameters())})->{TypeIdentity(method.ReturnType)}";
        }
    }

    private static string DescribeParameters(IEnumerable<ParameterInfo> parameters)
    {
        return string.Join(",", parameters.Select(DescribeParameter));
    }

    private static string DescribeParameter(ParameterInfo parameter)
    {
        var modifier = parameter.GetCustomAttribute<ParamArrayAttribute>() != null
            ? "params "
            : parameter.IsOut
                ? "out "
                : parameter.ParameterType.IsByRef && parameter.IsIn
                    ? "in "
                    : parameter.ParameterType.IsByRef
                        ? "ref "
                        : "";
        var optional = parameter.HasDefaultValue
            ? $"={FormatValue(parameter.DefaultValue)}"
            : "";
        var name = parameter.Name ?? $"arg{parameter.Position}";
        return $"{modifier}{name}:{TypeIdentity(parameter.ParameterType)}{optional}";
    }

    private static string DescribeGenericParameters(IEnumerable<Type> parameters)
    {
        return string.Join(";", parameters.Select(parameter =>
        {
            var constraints = string.Join("&", parameter.GetGenericParameterConstraints()
                .Select(TypeIdentity)
                .Order(StringComparer.Ordinal));
            return $"{parameter.Name}[attrs:{(int)parameter.GenericParameterAttributes},constraints:{constraints}]";
        }));
    }

    private static string PropertyAccess(PropertyInfo property)
    {
        var accessors = new List<string>();
        if (property.GetMethod != null)
        {
            accessors.Add($"get:{Visibility(property.GetMethod)}");
        }
        if (property.SetMethod != null)
        {
            var operation = IsInitOnly(property.SetMethod) ? "init" : "set";
            accessors.Add($"{operation}:{Visibility(property.SetMethod)}");
        }
        return string.Join(",", accessors);
    }

    private static string EventAccess(EventInfo @event)
    {
        var accessors = new List<string>();
        if (@event.AddMethod != null)
        {
            accessors.Add($"add:{Visibility(@event.AddMethod)}");
        }
        if (@event.RemoveMethod != null)
        {
            accessors.Add($"remove:{Visibility(@event.RemoveMethod)}");
        }
        return string.Join(",", accessors);
    }

    private static string TypeKind(Type type)
    {
        if (type.IsInterface)
        {
            return "interface";
        }
        if (type.IsEnum)
        {
            return "enum";
        }
        if (type.BaseType == typeof(MulticastDelegate))
        {
            return "delegate";
        }
        if (type.IsValueType)
        {
            return "struct";
        }
        if (type.IsAbstract && type.IsSealed)
        {
            return "static-class";
        }
        if (type.IsAbstract)
        {
            return "abstract-class";
        }
        return type.IsSealed ? "sealed-class" : "class";
    }

    private static string Scope(MethodBase method)
    {
        if (method.IsStatic)
        {
            return "static";
        }
        if (method.IsAbstract)
        {
            return "abstract";
        }
        if (method.IsVirtual && !method.IsFinal)
        {
            return "virtual";
        }
        return "instance";
    }

    private static string TypeIdentity(Type type)
    {
        if (type.IsGenericParameter)
        {
            return $"{(type.DeclaringMethod == null ? "!" : "!!")}{type.GenericParameterPosition}";
        }
        if (type.IsByRef)
        {
            return $"{TypeIdentity(type.GetElementType()!)}&";
        }
        if (type.IsPointer)
        {
            return $"{TypeIdentity(type.GetElementType()!)}*";
        }
        if (type.IsArray)
        {
            var rank = type.GetArrayRank();
            return $"{TypeIdentity(type.GetElementType()!)}[{new string(',', rank - 1)}]";
        }
        if (type.IsGenericType)
        {
            var definition = type.GetGenericTypeDefinition();
            return $"{definition.FullName}<{string.Join(",", type.GetGenericArguments().Select(TypeIdentity))}>";
        }
        return type.FullName ?? type.Name;
    }

    private static IEnumerable<(string Location, Type Type)> PublicSignatureTypes(Type type)
    {
        var owner = Owner(type);
        if (type.BaseType != null)
        {
            yield return ($"{owner} base", type.BaseType);
        }
        foreach (var @interface in type.GetInterfaces())
        {
            yield return ($"{owner} interface", @interface);
        }
        foreach (var constraint in type.GetGenericArguments()
                     .SelectMany(parameter => parameter.GetGenericParameterConstraints()))
        {
            yield return ($"{owner} generic constraint", constraint);
        }

        foreach (var constructor in type.GetConstructors(PublicDeclared))
        {
            foreach (var parameter in constructor.GetParameters())
            {
                yield return ($"{owner} constructor parameter {parameter.Name}", parameter.ParameterType);
            }
        }

        foreach (var method in type.GetMethods(PublicDeclared))
        {
            yield return ($"{owner}.{method.Name} return", method.ReturnType);
            foreach (var parameter in method.GetParameters())
            {
                yield return ($"{owner}.{method.Name} parameter {parameter.Name}", parameter.ParameterType);
            }
            foreach (var constraint in method.GetGenericArguments()
                         .SelectMany(parameter => parameter.GetGenericParameterConstraints()))
            {
                yield return ($"{owner}.{method.Name} generic constraint", constraint);
            }
        }

        foreach (var property in type.GetProperties(PublicDeclared))
        {
            yield return ($"{owner}.{property.Name} property", property.PropertyType);
            foreach (var parameter in property.GetIndexParameters())
            {
                yield return ($"{owner}.{property.Name} index parameter {parameter.Name}", parameter.ParameterType);
            }
        }

        foreach (var field in type.GetFields(PublicDeclared))
        {
            yield return ($"{owner}.{field.Name} field", field.FieldType);
        }

        foreach (var @event in type.GetEvents(PublicDeclared))
        {
            yield return ($"{owner}.{@event.Name} event", @event.EventHandlerType!);
        }
    }

    private static IEnumerable<Type> Flatten(Type type)
    {
        if (type.IsGenericParameter)
        {
            yield break;
        }
        if (type.IsArray || type.IsByRef || type.IsPointer)
        {
            foreach (var element in Flatten(type.GetElementType()!))
            {
                yield return element;
            }
            yield break;
        }

        yield return type;
        if (type.IsGenericType)
        {
            foreach (var argument in type.GetGenericArguments())
            {
                foreach (var nested in Flatten(argument))
                {
                    yield return nested;
                }
            }
        }
    }

    private static bool IsForbiddenSignatureType(Type type, Assembly gooAssembly)
    {
        if (type.Assembly == gooAssembly && !IsPubliclyVisible(type))
        {
            return true;
        }

        var typeNamespace = type.Namespace;
        return typeNamespace != null && ForbiddenNamespaceRoots.Any(root =>
            typeNamespace.Equals(root, StringComparison.Ordinal)
            || typeNamespace.StartsWith(root + ".", StringComparison.Ordinal));
    }

    private static bool IsPubliclyVisible(Type type)
    {
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            type = type.GetGenericTypeDefinition();
        }
        if (type.IsPublic)
        {
            return true;
        }
        return type.IsNestedPublic
            && type.DeclaringType != null
            && IsPubliclyVisible(type.DeclaringType);
    }

    private static string FormatValue(object? value)
    {
        return value switch
        {
            null => "null",
            string text => $"\"{Escape(text)}\"",
            char character => $"'{Escape(character.ToString())}'",
            bool flag => flag ? "true" : "false",
            _ => Escape(Convert.ToString(value, CultureInfo.InvariantCulture) ?? ""),
        };
    }

    private static string Escape(string value)
    {
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal)
            .Replace("|", "\\|", StringComparison.Ordinal)
            .Replace(",", "\\,", StringComparison.Ordinal);
    }

    private static string Visibility(Type type)
    {
        if (type.IsPublic || type.IsNestedPublic)
        {
            return "public";
        }
        if (type.IsNestedFamily)
        {
            return "protected";
        }
        return type.IsNestedFamORAssem ? "protected-internal" : "internal";
    }

    private static string Visibility(MethodBase method)
    {
        if (method.IsPublic)
        {
            return "public";
        }
        if (method.IsFamily)
        {
            return "protected";
        }
        if (method.IsFamilyOrAssembly)
        {
            return "protected-internal";
        }
        return method.IsAssembly ? "internal" : "private";
    }

    private static string Visibility(FieldInfo field)
    {
        if (field.IsPublic)
        {
            return "public";
        }
        if (field.IsFamily)
        {
            return "protected";
        }
        if (field.IsFamilyOrAssembly)
        {
            return "protected-internal";
        }
        return field.IsAssembly ? "internal" : "private";
    }

    private static bool IsInitOnly(MethodInfo setter)
    {
        return setter.ReturnParameter.GetRequiredCustomModifiers()
            .Contains(typeof(IsExternalInit));
    }

    private static bool IsPackageContainer(Type type)
    {
        return type.Name == "<Program>";
    }

    private static bool IsTestFixture(Type type)
    {
        return type.FullName == "Goo.PerformanceFixtures";
    }

    private static string Owner(Type type)
    {
        return type.FullName ?? type.Name;
    }

    private static string FindSourceBaseline()
    {
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            for (var directory = new DirectoryInfo(start); directory != null; directory = directory.Parent)
            {
                var project = Path.Combine(directory.FullName, "tests", "Goo.ApiContractTests", "Goo.ApiContractTests.csproj");
                if (File.Exists(project))
                {
                    return Path.Combine(directory.FullName, "tests", "Goo.ApiContractTests", "PublicApi.approved.txt");
                }
            }
        }

        throw new DirectoryNotFoundException("Could not find tests/Goo.ApiContractTests.");
    }
}
