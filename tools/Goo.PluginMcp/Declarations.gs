package Goo.PluginMcp

import System
import System.Collections.Generic
import System.Collections.Immutable
import System.IO
import System.Linq
import System.Reflection
import System.Reflection.Metadata
import System.Reflection.PortableExecutable
import System.Text.RegularExpressions

data class DeclarationContext(TypeParameters[]string, MethodParameters[]string) { }

class DeclarationTypes : ISignatureTypeProvider[string, object] {
    let Display bool

    init(display bool = false) {
        Display = display
    }

    func GetArrayType(elementType string, shape ArrayShape) string -> if Display {
        "[" + String(',', shape.Rank - 1) + "]" + elementType
    } else {
        elementType + "[" + string.Join(",", Enumerable.Repeat("0:", shape.Rank)) + "]"
    }

    func GetByReferenceType(elementType string) string -> elementType + "@"

    func GetFunctionPointerType(signature MethodSignature[string]) string -> "delegate*(" + string.Join(
        ", ",
        signature.ParameterTypes
    ) +
        ")" +
        (
        if signature.ReturnType == "" {
            ""
        } else {
            " " + signature.ReturnType
        }
    )

    func GetGenericInstantiation(genericType string, arguments ImmutableArray[string]) string -> Regex.Replace(
        genericType,
        "`[0-9]+",
        ""
    ) +
        (
        if Display {
            "["
        } else {
            "{"
        }
    ) +
        string.Join(
        if Display {
            ", "
        } else {
            ","
        },
        arguments
    ) +
        (
        if Display {
            "]"
        } else {
            "}"
        }
    )

    func GetGenericMethodParameter(context object, index int32) string -> if Display {
        DeclarationContext(context).MethodParameters[index]
    } else {
        "``" + index.ToString()
    }

    func GetGenericTypeParameter(context object, index int32) string -> if Display {
        DeclarationContext(context).TypeParameters[index]
    } else {
        "`" + index.ToString()
    }

    func GetModifiedType(modifier string, unmodifiedType string, required bool) string -> unmodifiedType

    func GetPinnedType(elementType string) string -> elementType

    func GetPointerType(elementType string) string -> elementType + "*"

    func GetSZArrayType(elementType string) string -> if Display {
        "[]" + elementType
    } else {
        elementType + "[]"
    }

    func GetPrimitiveType(code PrimitiveTypeCode) string {
        if !Display {
            return "System." + code.ToString()
        }
        return switch code {
            case PrimitiveTypeCode.Void: ""
            case PrimitiveTypeCode.Boolean: "bool"
            case PrimitiveTypeCode.Char: "char"
            case PrimitiveTypeCode.SByte: "int8"
            case PrimitiveTypeCode.Byte: "byte"
            case PrimitiveTypeCode.Int16: "int16"
            case PrimitiveTypeCode.UInt16: "uint16"
            case PrimitiveTypeCode.Int32: "int32"
            case PrimitiveTypeCode.UInt32: "uint32"
            case PrimitiveTypeCode.Int64: "int64"
            case PrimitiveTypeCode.UInt64: "uint64"
            case PrimitiveTypeCode.Single: "float32"
            case PrimitiveTypeCode.Double: "float64"
            case PrimitiveTypeCode.String: "string"
            case PrimitiveTypeCode.Object: "object"
            default: "System." + code.ToString()
        }
    }

    func GetTypeFromDefinition(reader MetadataReader, handle TypeDefinitionHandle, rawTypeKind byte) string {
        let type = reader.GetTypeDefinition(handle)
        let parent = type.GetDeclaringType()
        let prefix = if parent.IsNil {
            reader.GetString(type.Namespace)
        } else {
            GetTypeFromDefinition(reader, parent, rawTypeKind)
        }
        let name = (
            if prefix == "" {
                ""
            } else {
                prefix + "."
            }
        ) +
            reader.GetString(type.Name)
        return if Display {
            Regex.Replace(name, "`[0-9]+", "")
        } else {
            name
        }
    }

    func GetTypeFromReference(reader MetadataReader, handle TypeReferenceHandle, rawTypeKind byte) string {
        let type = reader.GetTypeReference(handle)
        let prefix = if type.ResolutionScope.Kind == HandleKind.TypeReference {
            GetTypeFromReference(reader, TypeReferenceHandle(type.ResolutionScope), rawTypeKind)
        } else {
            reader.GetString(type.Namespace)
        }
        let name = (
            if prefix == "" {
                ""
            } else {
                prefix + "."
            }
        ) +
            reader.GetString(type.Name)
        return if Display {
            Regex.Replace(name, "`[0-9]+", "")
        } else {
            name
        }
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
            let ids = DeclarationTypes()
            let display = DeclarationTypes(true)
            for handle in reader.TypeDefinitions {
                let type = reader.GetTypeDefinition(handle)
                let name = ids.GetTypeFromDefinition(reader, handle, 0)
                let typeArguments = type
                    .GetGenericParameters()
                    .Select(x -> reader.GetString(reader.GetGenericParameter(x).Name))
                    .ToArray()
                let context object = DeclarationContext(typeArguments, Array.Empty[string]())
                result["T:" + name] = "type " + display.GetTypeFromDefinition(reader, handle, 0) +
                    (
                    if typeArguments.Length == 0 {
                        ""
                    } else {
                        "[" + string.Join(", ", typeArguments) + "]"
                    }
                )
                for fieldHandle in type.GetFields() {
                    let field = reader.GetFieldDefinition(fieldHandle)
                    let prefix = if (field.Attributes & FieldAttributes.Static) != FieldAttributes.PrivateScope {
                        "shared "
                    } else {
                        ""
                    }
                    result["F:" + name + "." + reader.GetString(field.Name)] = prefix + reader.GetString(field.Name) +
                        " " +
                        field.DecodeSignature(display, context)
                }
                for propertyHandle in type.GetProperties() {
                    let property = reader.GetPropertyDefinition(propertyHandle)
                    let signature = property.DecodeSignature(ids, context)
                    let declaration = property.DecodeSignature(display, context)
                    let accessors = property.GetAccessors()
                    let accessor = if accessors.Getter.IsNil {
                        accessors.Setter
                    } else {
                        accessors.Getter
                    }
                    let prefix = if !accessor.IsNil &&
                        (
                        reader.GetMethodDefinition(accessor).Attributes & MethodAttributes.Static
                    ) != MethodAttributes.PrivateScope {
                        "shared "
                    } else {
                        ""
                    }
                    let key = "P:" + name + "." + reader.GetString(property.Name) +
                        (
                        if signature.ParameterTypes.Length == 0 {
                            ""
                        } else {
                            "(" + string.Join(",", signature.ParameterTypes) + ")"
                        }
                    )
                    result[key] = prefix + reader.GetString(property.Name) +
                        " " +
                        declaration.ReturnType +
                        (
                        if accessors.Setter.IsNil {
                            " (get-only)"
                        } else {
                            " (get, set)"
                        }
                    )
                }
                for methodHandle in type.GetMethods() {
                    let method = reader.GetMethodDefinition(methodHandle)
                    let methodArguments = method
                        .GetGenericParameters()
                        .Select(x -> reader.GetString(reader.GetGenericParameter(x).Name))
                        .ToArray()
                    let methodContext object = DeclarationContext(typeArguments, methodArguments)
                    let signature = method.DecodeSignature(ids, methodContext)
                    let declaration = method.DecodeSignature(display, methodContext)
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
                        .ToDictionary(x -> int32(x.SequenceNumber) - 1, x -> x)
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
                    let args = declaration.ParameterTypes.Select(
                        (value string, index int32) -> {
                            let found = parameters.TryGetValue(index, out var parameter)
                            let parameterName = if found {
                                reader.GetString(parameter.Name)
                            } else {
                                "arg" + index.ToString()
                            }
                            let modifier = if found &&
                                (parameter.Attributes & ParameterAttributes.Out) != ParameterAttributes.None {
                                "out "
                            } else if value.EndsWith("@") {
                                "ref "
                            } else {
                                ""
                            }
                            return modifier + parameterName + " " + value.TrimEnd('@')
                        }
                    )
                    let prefix = if (method.Attributes & MethodAttributes.Static) != MethodAttributes.PrivateScope {
                        "shared "
                    } else {
                        ""
                    }
                    let constructor = methodName == ".ctor" || methodName == ".cctor"
                    let declaredName = if constructor {
                        reader.GetString(type.Name).Split('`')[0]
                    } else {
                        methodName
                    }
                    result[key] = prefix +
                        declaredName +
                        (
                        if methodArguments.Length == 0 {
                            ""
                        } else {
                            "[" + string.Join(", ", methodArguments) + "]"
                        }
                    ) +
                        "(" +
                        string.Join(", ", args) +
                        ")" +
                        (
                        if constructor || declaration.ReturnType == "" {
                            ""
                        } else {
                            " " + declaration.ReturnType
                        }
                    )
                }
            }
            return result
        }
    }
}
