package Goo.PluginMcp

import System
import System.Collections.Generic
import System.Collections.Immutable
import System.IO
import System.Linq
import System.Reflection.Metadata
import System.Reflection.PortableExecutable
import System.Text.RegularExpressions

class DeclarationTypes : ISignatureTypeProvider[string, object] {
    func GetArrayType(elementType string, shape ArrayShape) string -> elementType + "[" + string.Join(
        ",",
        Enumerable.Repeat("0:", shape.Rank)
    ) +
        "]"

    func GetByReferenceType(elementType string) string -> elementType + "@"

    func GetFunctionPointerType(signature MethodSignature[string]) string -> "delegate*(" + string.Join(
        ",",
        signature.ParameterTypes
    ) +
        ") " +
        signature.ReturnType

    func GetGenericInstantiation(genericType string, arguments ImmutableArray[string]) string -> Regex.Replace(
        genericType,
        "`[0-9]+$",
        ""
    ) +
        "{" +
        string.Join(",", arguments) + "}"

    func GetGenericMethodParameter(context object, index int32) string -> "``" + index.ToString()

    func GetGenericTypeParameter(context object, index int32) string -> "`" + index.ToString()

    func GetModifiedType(modifier string, unmodifiedType string, required bool) string -> unmodifiedType

    func GetPinnedType(elementType string) string -> elementType

    func GetPointerType(elementType string) string -> elementType + "*"

    func GetSZArrayType(elementType string) string -> elementType + "[]"

    func GetPrimitiveType(code PrimitiveTypeCode) string -> "System." + switch code {
        case PrimitiveTypeCode.Void: "Void"
        case PrimitiveTypeCode.Boolean: "Boolean"
        case PrimitiveTypeCode.Char: "Char"
        case PrimitiveTypeCode.SByte: "SByte"
        case PrimitiveTypeCode.Byte: "Byte"
        case PrimitiveTypeCode.Int16: "Int16"
        case PrimitiveTypeCode.UInt16: "UInt16"
        case PrimitiveTypeCode.Int32: "Int32"
        case PrimitiveTypeCode.UInt32: "UInt32"
        case PrimitiveTypeCode.Int64: "Int64"
        case PrimitiveTypeCode.UInt64: "UInt64"
        case PrimitiveTypeCode.Single: "Single"
        case PrimitiveTypeCode.Double: "Double"
        case PrimitiveTypeCode.String: "String"
        case PrimitiveTypeCode.IntPtr: "IntPtr"
        case PrimitiveTypeCode.UIntPtr: "UIntPtr"
        case PrimitiveTypeCode.TypedReference: "TypedReference"
        default: "Object"
    }

    func GetTypeFromDefinition(reader MetadataReader, handle TypeDefinitionHandle, rawTypeKind byte) string {
        let type = reader.GetTypeDefinition(handle)
        let parent = type.GetDeclaringType()
        let prefix = if parent.IsNil {
            reader.GetString(type.Namespace)
        } else {
            GetTypeFromDefinition(reader, parent, rawTypeKind)
        }
        return (
            if prefix == "" {
                ""
            } else {
                prefix + "."
            }
        ) +
            reader.GetString(type.Name)
    }

    func GetTypeFromReference(reader MetadataReader, handle TypeReferenceHandle, rawTypeKind byte) string {
        let type = reader.GetTypeReference(handle)
        let prefix = if type.ResolutionScope.Kind == HandleKind.TypeReference {
            GetTypeFromReference(reader, TypeReferenceHandle(type.ResolutionScope), rawTypeKind)
        } else {
            reader.GetString(type.Namespace)
        }
        return (
            if prefix == "" {
                ""
            } else {
                prefix + "."
            }
        ) +
            reader.GetString(type.Name)
    }

    func GetTypeFromSpecification(
        reader MetadataReader,
        context object,
        handle TypeSpecificationHandle,
        rawTypeKind byte
    ) string -> reader
        .GetTypeSpecification(handle).DecodeSignature(this, context)
}

partial class GooServer {
    shared {
        func Declarations(filename string) Dictionary[string, string] {
            let result = Dictionary[string, string](StringComparer.Ordinal)
            let assembly = Path.ChangeExtension(filename, ".dll")
            if !File.Exists(assembly) {
                return result
            }
            using let stream = File.OpenRead(assembly)
            using let pe = PEReader(stream)
            let reader = pe.GetMetadataReader()
            let provider = DeclarationTypes()
            for handle in reader.TypeDefinitions {
                let type = reader.GetTypeDefinition(handle)
                let name = provider.GetTypeFromDefinition(reader, handle, 0)
                let typeArguments = type
                    .GetGenericParameters()
                    .Select(x -> reader.GetString(reader.GetGenericParameter(x).Name))
                    .ToArray()
                result["T:" + name] = "type " + Regex.Replace(name, "`[0-9]+", "") +
                    (
                    if typeArguments.Length == 0 {
                        ""
                    } else {
                        "[" + string.Join(", ", typeArguments) + "]"
                    }
                )
                for fieldHandle in type.GetFields() {
                    let field = reader.GetFieldDefinition(fieldHandle)
                    let fieldType = field.DecodeSignature(provider, nil)
                    result["F:" + name + "." + reader.GetString(field.Name)] = reader.GetString(field.Name) +
                        " " +
                        DisplayType(fieldType, typeArguments, []string{}) +
                        DelegateDeclaration(fieldType, typeArguments)
                }
                for propertyHandle in type.GetProperties() {
                    let property = reader.GetPropertyDefinition(propertyHandle)
                    let signature = property.DecodeSignature(provider, nil)
                    let key = "P:" + name + "." + reader.GetString(property.Name) +
                        (
                        if signature.ParameterTypes.Length == 0 {
                            ""
                        } else {
                            "(" + string.Join(",", signature.ParameterTypes) + ")"
                        }
                    )
                    result[key] = reader.GetString(property.Name) +
                        " " +
                        DisplayType(signature.ReturnType, typeArguments, []string{}) +
                        DelegateDeclaration(signature.ReturnType, typeArguments)
                }
                for methodHandle in type.GetMethods() {
                    let method = reader.GetMethodDefinition(methodHandle)
                    let signature = method.DecodeSignature(provider, nil)
                    let methodArguments = method
                        .GetGenericParameters()
                        .Select(x -> reader.GetString(reader.GetGenericParameter(x).Name))
                        .ToArray()
                    let methodName = reader.GetString(method.Name)
                    let generic = if methodArguments.Length == 0 {
                        ""
                    } else {
                        "``" + methodArguments.Length.ToString()
                    }
                    let parameters = method
                        .GetParameters()
                        .Select(x -> reader.GetParameter(x))
                        .Where(x -> x.SequenceNumber > 0)
                        .ToDictionary(x -> int32(x.SequenceNumber) - 1, x -> reader.GetString(x.Name))
                    let key = "M:" + name + "." + methodName.Replace('.', '#') +
                        generic +
                        (
                        if signature.ParameterTypes.Length == 0 {
                            ""
                        } else {
                            "(" + string.Join(",", signature.ParameterTypes) + ")"
                        }
                    ) +
                        (
                        if methodName == "op_Implicit" || methodName == "op_Explicit" {
                            "~" + signature.ReturnType
                        } else {
                            ""
                        }
                    )
                    let args = signature.ParameterTypes.Select(
                        (value string, index int32) -> (
                            if parameters.TryGetValue(index, out var parameter) {
                                parameter
                            } else {
                                "arg" + index.ToString()
                            }
                        ) +
                            " " +
                            DisplayType(value, typeArguments, methodArguments)
                    )
                    result[key] = methodName +
                        (
                        if methodArguments.Length == 0 {
                            ""
                        } else {
                            "[" + string.Join(", ", methodArguments) + "]"
                        }
                    ) +
                        "(" +
                        string.Join(", ", args) +
                        ") " +
                        DisplayType(signature.ReturnType, typeArguments, methodArguments)
                }
            }
            return result
        }

        func DelegateDeclaration(value string, typeArguments[]string) string {
            if value != "System.Action" && !value.StartsWith("System.Action{") && !value.StartsWith("System.Func{") {
                return ""
            }
            let arguments = List[string]()
            let start = value.IndexOf('{') + 1
            var begin = start
            var depth = 0
            if start > 0 {
                for index in start ... (value.Length - 1) {
                    if value[index] == '{' {
                        depth++
                    }
                    if value[index] == '}' {
                        depth--
                    }
                    if value[index] == ',' && depth == 0 {
                        arguments.Add(value.Substring(begin, index - begin))
                        begin = index + 1
                    }
                }
                arguments.Add(value.Substring(begin, value.Length - begin - 1))
            }
            let returns = if value.StartsWith("System.Func{") {
                arguments.Last()
            } else {
                "System.Void"
            }
            let count = arguments.Count - (
                if value.StartsWith("System.Func{") {
                    1
                } else {
                    0
                }
            )
            return "\nInvoke(" + string.Join(
                ", ",
                arguments.Take(count).Select(
                    (argument string, index int32) -> "arg" + index.ToString() +
                        " " +
                        DisplayType(argument, typeArguments, []string{})
                )
            ) +
                ") " +
                DisplayType(returns, typeArguments, []string{})
        }

        func DisplayType(value string, typeArguments[]string, methodArguments[]string) string {
            let replaced = Regex.Replace(
                value,
                "(``?)([0-9]+)",
                (match Match) -> {
                    let arguments = if match.Groups[1].Value == "``" {
                        methodArguments
                    } else {
                        typeArguments
                    }
                    let index = int32.Parse(match.Groups[2].Value)
                    return if index < arguments.Length {
                        arguments[index]
                    } else {
                        match.Value
                    }
                }
            )
            return replaced.Replace('{', '[').Replace('}', ']')
        }
    }
}
