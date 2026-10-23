import System.Xml.Linq
import System
import System.Collections.Generic
import System.IO
import System.Linq

func ParseArguments(values[]string) Dictionary[string, string] {
    if values.Length % 2 != 0 {
        throw ArgumentException("Arguments must be --name value pairs.")
    }
    let result = Dictionary[string, string](StringComparer.Ordinal)
    for var index = 0; index < values.Length; index += 2 {
        if !values[index].StartsWith("--", StringComparison.Ordinal) {
            throw ArgumentException("Invalid argument: ${values[index]}")
        }
        if !result.TryAdd(values[index][2 ..], values[index + 1]) {
            throw ArgumentException("Duplicate argument: ${values[index]}")
        }
    }
    return result
}

func RequireFile(arguments IReadOnlyDictionary[string, string], name string) FileInfo {
    if !arguments.TryGetValue(name, out var value) {
        throw ArgumentException("Missing argument: --$name")
    }
    let file = FileInfo(value)
    if !file.Exists {
        throw FileNotFoundException("XML documentation is missing: ${file.FullName}", file.FullName)
    }
    return file
}

func LoadDocument(file FileInfo) XDocument {
    let document = XDocument.Load(file.FullName, LoadOptions.PreserveWhitespace)
    if document.Root?.Name != "doc" {
        throw InvalidDataException("XML documentation root must be <doc>: ${file.FullName}")
    }
    return document
}

func RequireMembers(document XDocument, file FileInfo) XElement -> document.Root?.Element(XName?("members")!!) ??
    throw InvalidDataException("XML documentation has no <members>: ${file.FullName}")

func RequireMemberName(member XElement) string -> member.Attribute(XName?("name")!!)
    ?.Value ??
    throw InvalidDataException("XML documentation member has no name.")

func NormalizeText(value string) string -> string.Join(
    " ",
    value.Split(default([]?char), StringSplitOptions.RemoveEmptyEntries)
)

func Equivalent(left XElement, right XElement) bool {
    if left.Name != right.Name {
        return false
    }
    let leftAttributes = left
        .Attributes()
        .OrderBy((attribute XAttribute) -> attribute.Name.ToString(), StringComparer.Ordinal)
        .ToArray()
    let rightAttributes = right
        .Attributes()
        .OrderBy((attribute XAttribute) -> attribute.Name.ToString(), StringComparer.Ordinal)
        .ToArray()
    if leftAttributes.Length != rightAttributes.Length {
        return false
    }
    for var index = 0; index < leftAttributes.Length; index++ {
        if leftAttributes[index].Name != rightAttributes[index].Name ||
            leftAttributes[index].Value != rightAttributes[index].Value {
            return false
        }
    }
    if NormalizeText(left.Value) != NormalizeText(right.Value) {
        return false
    }
    let leftChildren = left.Elements().ToArray()
    let rightChildren = right.Elements().ToArray()
    if leftChildren.Length != rightChildren.Length {
        return false
    }
    for var index = 0; index < leftChildren.Length; index++ {
        if !Equivalent(leftChildren[index], rightChildren[index]) {
            return false
        }
    }
    return true
}

let arguments = ParseArguments(args)
let generated = RequireFile(arguments, "generated")
let supplement = RequireFile(arguments, "supplement")
let document = LoadDocument(generated)
let members = RequireMembers(document, generated)
let existing = members.Elements("member").ToDictionary(RequireMemberName, StringComparer.Ordinal)

for member in RequireMembers(LoadDocument(supplement), supplement).Elements("member") {
    let name = RequireMemberName(member)
    if existing.TryGetValue(name, out var current) {
        if !Equivalent(current, member) {
            throw InvalidDataException("Conflicting XML documentation member: $name")
        }
        continue
    }
    existing.Add(name, XElement(member))
}

members.ReplaceNodes(
    existing.OrderBy((pair KeyValuePair[string, XElement]) -> pair.Key, StringComparer.Ordinal).Select(
        (pair KeyValuePair[string, XElement]) -> pair.Value
    )
)

let temporary = Path.Combine(generated.DirectoryName!!, ".${generated.Name}.${Guid.NewGuid():N}")

try {
    document.Save(temporary)
    File.Move(temporary, generated.FullName, true)
} finally {
    if File.Exists(temporary) {
        File.Delete(temporary)
    }
}
