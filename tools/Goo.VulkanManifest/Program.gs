import System
import System.IO
import System.Text.Json
import System.Text.Json.Nodes

let arguments = Environment.GetCommandLineArgs()
let manifest = arguments[1]
let document = JsonNode.Parse(File.ReadAllText(manifest)) ?? throw InvalidDataException("Missing Vulkan manifest")
let layer = document["layer"] ?? throw InvalidDataException("Missing Vulkan layer")
if layer["name"]?.GetValue[string]() != "VK_LAYER_KHRONOS_validation" ||
    layer["api_version"]?.GetValue[string]() != "1.4.313" ||
    layer["implementation_version"]?.GetValue[string]() != "1" ||
    layer["library_path"]?.GetValue[string]() != "libVkLayer_khronos_validation.so" {
    throw InvalidDataException("Unexpected Vulkan validation layer manifest")
}
layer["library_path"] = JsonValue.Create(Path.GetFullPath(arguments[2]))
let options = JsonSerializerOptions()
options.WriteIndented = true
options.IndentSize = 4
File.WriteAllText(manifest, document.ToJsonString(options) + "\n")
