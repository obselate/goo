package Goo.PluginMcp

import ModelContextProtocol.Protocol
import ModelContextProtocol.Server
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Reflection
import System.Text.Json
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks

class McpHost {
    shared {
        async func RunAsync(root string, verify bool = false) int32 {
            if verify {
                await Verify.Run(root)
                return 0
            }
            let goo = GooServer(root)
            let options = McpServerOptions(){
                ServerInfo = Implementation(){Name = "Goo", Version = goo.Version},
                ServerInstructions = "Author standalone G# Goo desktop apps. Use current checkout docs when available. Inspect running apps through Goo DevTools. This is not s&box Goo."
            }
            options
                .Handlers
                .ListToolsHandler = (request, cancellation) -> ValueTask[ListToolsResult](
                ListToolsResult(){Tools = goo.Tools}
            )
            options
                .Handlers
                .CallToolHandler = (request, cancellation) -> ValueTask[CallToolResult](
                Task.Run(() -> goo.Call(request.Params.Name, request.Params.Arguments), cancellation)
            )
            let transport = StdioServerTransport("Goo")
            let server = McpServer.Create(transport, options)
            try {
                await server.RunAsync()
            } finally {
                await server.DisposeAsync()
                await transport.DisposeAsync()
            }
            return 0
        }
    }
}

partial class GooServer {
    let Root string
    let Bundle string
    let Manifest JsonObject
    let Version string
    let LoadedFingerprint string
    let Tools List[Tool]
    let Definitions JsonArray

    init(root string) {
        Root = Resolve(root)
        Bundle = Path.Combine(Root, "reference")
        Manifest = JsonNode.Parse(File.ReadAllText(Path.Combine(Bundle, "manifest.json")))!!.AsObject()
        Version = JsonNode.Parse(File.ReadAllText(Path.Combine(Root, "plugin.json")))!!["version"]!!.GetValue[string]()
        using let resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Goo.PluginMcp.Tools.json")!!
        using let reader = StreamReader(resource)
        let definitions = reader.ReadToEnd()
        Definitions = JsonNode.Parse(definitions)!!.AsArray()
        Tools = JsonSerializer.Deserialize[List[Tool]](definitions)
        LoadedFingerprint = Fingerprint()
    }

    func Call(name string, arguments IDictionary[string, JsonElement]?) CallToolResult {
        try {
            let a = Arguments(name, arguments)
            if name == "goo_capture" {
                return Capture(a)
            }
            let result = switch name {
                case "goo_context": Context(S(a, "repository"))
                case "goo_search": Search(a)
                case "goo_read": Read(a)
                case "goo_starter": Starter(a)
                case "goo_targets": Targets(a)
                case "goo_capabilities": Capabilities(a)
                case "goo_snapshot": Snapshot(a)
                case "goo_input": Input(a)
                case "goo_inspect": Inspect(a)
                case "goo_style_override": Style(a, false)
                case "goo_style_reset": Style(a, true)
                default: throw ArgumentException("Unknown tool: " + name)
            }
            return CallToolResult(){
                StructuredContent = JsonSerializer.SerializeToElement(result),
                Content = List[ContentBlock](){TextContentBlock(){Text = result.ToJsonString()}}
            }
        } catch (error Exception) {
            return CallToolResult(){
                IsError = true,
                StructuredContent = if error is GooFailure {
                    JsonSerializer.SerializeToElement(error.Detail)
                } else {
                    nil
                },
                Content = List[ContentBlock](){TextContentBlock(){Text = error.Message}}
            }
        }
    }

    func Arguments(name string, arguments IDictionary[string, JsonElement]?) JsonObject {
        let definition = Definitions.FirstOrDefault(x -> S(x, "name") == name)
        if definition == nil {
            throw ArgumentException("Unknown tool: " + name)
        }
        let schema = definition["inputSchema"]!!
        let result = JsonObject()
        for property in schema["properties"]!!.AsObject() {
            let spec = property.Value
            var value JsonNode? = nil
            if arguments != nil && arguments.TryGetValue(property.Key, out var supplied) {
                value = JsonNode.Parse(supplied.GetRawText())
            } else if spec.AsObject().ContainsKey("default") {
                value = spec["default"]?.DeepClone()
            } else {
                throw ArgumentException("Missing required argument: " + property.Key)
            }
            let type = S(spec, "type")
            let nullable = spec["anyOf"] is JsonArray
            let expected = if nullable {
                S(spec["anyOf"]!![0]!!, "type")
            } else {
                type
            }
            if value == nil {
                if !nullable {
                    throw ArgumentException(property.Key + " must be " + expected)
                }
            } else {
                let kind = value.GetValueKind()
                let valid = switch expected {
                    case "string": kind == JsonValueKind.String
                    case "boolean": kind == JsonValueKind.True || kind == JsonValueKind.False
                    case "integer": kind == JsonValueKind.Number && value.AsValue().TryGetValue[decimal](
                        out var number
                    ) &&
                        decimal.Truncate(number) == number
                    case "number": kind == JsonValueKind.Number && double.IsFinite(value.GetValue[double]())
                    default: false
                }
                if !valid {
                    throw ArgumentException(property.Key + " must be " + expected)
                }
                if expected == "integer" {
                    value = JsonValue.Create(checked(int64(value.GetValue[decimal]())))
                }
                if spec["enum"] is JsonArray && !spec["enum"]!!.AsArray().Any(x -> JsonNode.DeepEquals(x, value)) {
                    throw ArgumentException("Invalid " + property.Key + ": " + value!!.ToJsonString())
                }
            }
            result[property.Key] = value
        }
        return result
    }

    shared {
        func S(node JsonNode, key string, fallback string = "") string -> node[key]?.GetValue[string]() ?? fallback

        func I(node JsonNode, key string, fallback int64 = 0) int64 {
            let value = node[key]
            if value == nil {
                return fallback
            }
            if value.AsValue().TryGetValue[int64](out var number) {
                return number
            }
            return int64(value.GetValue[int32]())
        }

        func B(node JsonNode, key string) bool -> node[key] is JsonValue value && value.TryGetValue[bool](
            out var boolean
        ) &&
            boolean

        func Strings(values IEnumerable[string]) JsonArray {
            let result = JsonArray()
            for value in values {
                result.Add(value)
            }
            return result
        }
    }
}

open class GooFailure : Exception {
    let Detail JsonObject

    init(detail JsonObject) : base(detail.ToJsonString()) {
        Detail = detail
    }
}

class GooTimeout : GooFailure {
    init(detail JsonObject) : base(detail) { }
}
