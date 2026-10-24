import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Security.Cryptography
import System.Text
import System.Text.Encodings.Web
import System.Text.Json
import System.Text.Json.Serialization
import System.Threading.Tasks

internal shared class Program {
    private class Manifest {
        @JsonPropertyName("schema")
        prop Schema int32

        private var _toolchain Toolchain = Toolchain()

        @JsonPropertyName("toolchain")
        prop Toolchain Toolchain {
            get {
                return _toolchain
            }
            set {
                _toolchain = value
            }
        }

        private var _target Target = Target()

        @JsonPropertyName("target")
        prop Target Target {
            get {
                return _target
            }
            set {
                _target = value
            }
        }

        private var _compileFlags List[string] = List[string]()

        @JsonPropertyName("compileFlags")
        prop CompileFlags List[string] {
            get {
                return _compileFlags
            }
            set {
                _compileFlags = value
            }
        }

        private var _compatibilityCompileFlags List[string] = List[string]()

        @JsonPropertyName("compatibilityCompileFlags")
        prop CompatibilityCompileFlags List[string] {
            get {
                return _compatibilityCompileFlags
            }
            set {
                _compatibilityCompileFlags = value
            }
        }

        private var _primitiveRecord PrimitiveRecord = PrimitiveRecord()

        @JsonPropertyName("primitiveRecord")
        prop PrimitiveRecord PrimitiveRecord {
            get {
                return _primitiveRecord
            }
            set {
                _primitiveRecord = value
            }
        }

        private var _textInstanceRecord TextInstanceRecord = TextInstanceRecord()

        @JsonPropertyName("textInstanceRecord")
        prop TextInstanceRecord TextInstanceRecord {
            get {
                return _textInstanceRecord
            }
            set {
                _textInstanceRecord = value
            }
        }

        private var _assemblies List[ShaderAssembly] = List[ShaderAssembly]()

        @JsonPropertyName("assemblies")
        prop Assemblies List[ShaderAssembly] {
            get {
                return _assemblies
            }
            set {
                _assemblies = value
            }
        }

        private var _shaders List[Shader] = List[Shader]()

        @JsonPropertyName("shaders")
        prop Shaders List[Shader] {
            get {
                return _shaders
            }
            set {
                _shaders = value
            }
        }

        private var _pipelines List[Pipeline] = List[Pipeline]()

        @JsonPropertyName("pipelines")
        prop Pipelines List[Pipeline] {
            get {
                return _pipelines
            }
            set {
                _pipelines = value
            }
        }
    }

    private class Toolchain {
        private var _sdk string = string.Empty

        @JsonPropertyName("sdk")
        prop Sdk string {
            get {
                return _sdk
            }
            set {
                _sdk = value
            }
        }

        private var _compiler Tool = Tool()

        @JsonPropertyName("compiler")
        prop Compiler Tool {
            get {
                return _compiler
            }
            set {
                _compiler = value
            }
        }

        private var _compatibilityCompiler Tool = Tool()

        @JsonPropertyName("compatibilityCompiler")
        prop CompatibilityCompiler Tool {
            get {
                return _compatibilityCompiler
            }
            set {
                _compatibilityCompiler = value
            }
        }

        private var _validator Tool = Tool()

        @JsonPropertyName("validator")
        prop Validator Tool {
            get {
                return _validator
            }
            set {
                _validator = value
            }
        }

        private var _dependencies List[Dependency] = List[Dependency]()

        @JsonPropertyName("dependencies")
        prop Dependencies List[Dependency] {
            get {
                return _dependencies
            }
            set {
                _dependencies = value
            }
        }

        private var _archives List[Archive] = List[Archive]()

        @JsonPropertyName("archives")
        prop Archives List[Archive] {
            get {
                return _archives
            }
            set {
                _archives = value
            }
        }

        private var _registry Registry = Registry()

        @JsonPropertyName("registry")
        prop Registry Registry {
            get {
                return _registry
            }
            set {
                _registry = value
            }
        }
    }

    private class Tool {
        private var _project string = string.Empty

        @JsonPropertyName("project")
        prop Project string {
            get {
                return _project
            }
            set {
                _project = value
            }
        }

        private var _version string = string.Empty

        @JsonPropertyName("version")
        prop Version string {
            get {
                return _version
            }
            set {
                _version = value
            }
        }

        private var _commit string = string.Empty

        @JsonPropertyName("commit")
        prop Commit string {
            get {
                return _commit
            }
            set {
                _commit = value
            }
        }

        private var _executable string = string.Empty

        @JsonPropertyName("executable")
        prop Executable string {
            get {
                return _executable
            }
            set {
                _executable = value
            }
        }
    }

    private class Dependency {
        private var _project2 string = string.Empty

        @JsonPropertyName("project")
        prop Project string {
            get {
                return _project2
            }
            set {
                _project2 = value
            }
        }

        private var _version2 string = string.Empty

        @JsonPropertyName("version")
        prop Version string {
            get {
                return _version2
            }
            set {
                _version2 = value
            }
        }

        private var _commit2 string = string.Empty

        @JsonPropertyName("commit")
        prop Commit string {
            get {
                return _commit2
            }
            set {
                _commit2 = value
            }
        }
    }

    private class Archive {
        private var _rid string = string.Empty

        @JsonPropertyName("rid")
        prop Rid string {
            get {
                return _rid
            }
            set {
                _rid = value
            }
        }

        private var _file string = string.Empty

        @JsonPropertyName("file")
        prop File string {
            get {
                return _file
            }
            set {
                _file = value
            }
        }

        private var _url string = string.Empty

        @JsonPropertyName("url")
        prop Url string {
            get {
                return _url
            }
            set {
                _url = value
            }
        }

        private var _sha256 string = string.Empty

        @JsonPropertyName("sha256")
        prop Sha256 string {
            get {
                return _sha256
            }
            set {
                _sha256 = value
            }
        }
    }

    private class Registry {
        private var _project3 string = string.Empty

        @JsonPropertyName("project")
        prop Project string {
            get {
                return _project3
            }
            set {
                _project3 = value
            }
        }

        private var _version3 string = string.Empty

        @JsonPropertyName("version")
        prop Version string {
            get {
                return _version3
            }
            set {
                _version3 = value
            }
        }

        private var _commit3 string = string.Empty

        @JsonPropertyName("commit")
        prop Commit string {
            get {
                return _commit3
            }
            set {
                _commit3 = value
            }
        }

        private var _vkXmlSha256 string = string.Empty

        @JsonPropertyName("vkXmlSha256")
        prop VkXmlSha256 string {
            get {
                return _vkXmlSha256
            }
            set {
                _vkXmlSha256 = value
            }
        }
    }

    private class Target {
        private var _language string = string.Empty

        @JsonPropertyName("language")
        prop Language string {
            get {
                return _language
            }
            set {
                _language = value
            }
        }

        private var _slangVersion string = string.Empty

        @JsonPropertyName("slangVersion")
        prop SlangVersion string {
            get {
                return _slangVersion
            }
            set {
                _slangVersion = value
            }
        }

        private var _vulkan string = string.Empty

        @JsonPropertyName("vulkan")
        prop Vulkan string {
            get {
                return _vulkan
            }
            set {
                _vulkan = value
            }
        }

        private var _spirv string = string.Empty

        @JsonPropertyName("spirv")
        prop Spirv string {
            get {
                return _spirv
            }
            set {
                _spirv = value
            }
        }
    }

    private class Shader {
        private var _id string = string.Empty

        @JsonPropertyName("id")
        prop Id string {
            get {
                return _id
            }
            set {
                _id = value
            }
        }

        private var _stage string = string.Empty

        @JsonPropertyName("stage")
        prop Stage string {
            get {
                return _stage
            }
            set {
                _stage = value
            }
        }

        private var _source string = string.Empty

        @JsonPropertyName("source")
        prop Source string {
            get {
                return _source
            }
            set {
                _source = value
            }
        }

        private var _output string = string.Empty

        @JsonPropertyName("output")
        prop Output string {
            get {
                return _output
            }
            set {
                _output = value
            }
        }

        private var _entryPoint string = string.Empty

        @JsonPropertyName("entryPoint")
        prop EntryPoint string {
            get {
                return _entryPoint
            }
            set {
                _entryPoint = value
            }
        }

        @JsonPropertyName("assembly")
        @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
        prop Assembly string?

        @JsonPropertyName("sourceSha256")
        @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
        prop SourceSha256 string?

        @JsonPropertyName("outputSha256")
        @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
        prop OutputSha256 string?

        @JsonPropertyName("outputBytes")
        @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
        prop OutputBytes int64?

        private var _capabilities List[uint32] = List[uint32]()

        @JsonPropertyName("capabilities")
        prop Capabilities List[uint32] {
            get {
                return _capabilities
            }
            set {
                _capabilities = value
            }
        }
    }

    private class ShaderAssembly {
        private var _id2 string = string.Empty

        @JsonPropertyName("id")
        prop Id string {
            get {
                return _id2
            }
            set {
                _id2 = value
            }
        }

        private var _kind string = string.Empty

        @JsonPropertyName("kind")
        prop Kind string {
            get {
                return _kind
            }
            set {
                _kind = value
            }
        }

        private var _tag string = string.Empty

        @JsonPropertyName("tag")
        prop Tag string {
            get {
                return _tag
            }
            set {
                _tag = value
            }
        }

        private var _commit4 string = string.Empty

        @JsonPropertyName("commit")
        prop Commit string {
            get {
                return _commit4
            }
            set {
                _commit4 = value
            }
        }

        private var _provenance string = string.Empty

        @JsonPropertyName("provenance")
        prop Provenance string {
            get {
                return _provenance
            }
            set {
                _provenance = value
            }
        }

        private var _provenanceSha256 string = string.Empty

        @JsonPropertyName("provenanceSha256")
        prop ProvenanceSha256 string {
            get {
                return _provenanceSha256
            }
            set {
                _provenanceSha256 = value
            }
        }

        @JsonPropertyName("atlasSet")
        prop AtlasSet int32

        @JsonPropertyName("atlasBinding")
        prop AtlasBinding int32

        private var _parts List[AssemblyPart] = List[AssemblyPart]()

        @JsonPropertyName("parts")
        prop Parts List[AssemblyPart] {
            get {
                return _parts
            }
            set {
                _parts = value
            }
        }
    }

    private class AssemblyPart {
        private var _path string = string.Empty

        @JsonPropertyName("path")
        prop Path string {
            get {
                return _path
            }
            set {
                _path = value
            }
        }

        private var _sha2562 string = string.Empty

        @JsonPropertyName("sha256")
        prop Sha256 string {
            get {
                return _sha2562
            }
            set {
                _sha2562 = value
            }
        }
    }

    private class HostPacking {
        private var _path2 string = string.Empty

        @JsonPropertyName("path")
        prop Path string {
            get {
                return _path2
            }
            set {
                _path2 = value
            }
        }

        private var _typeName string = string.Empty

        @JsonPropertyName("typeName")
        prop TypeName string {
            get {
                return _typeName
            }
            set {
                _typeName = value
            }
        }

        @JsonPropertyName("sha256")
        @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
        prop Sha256 string?

        @JsonPropertyName("bytes")
        @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
        prop Bytes int64?
    }

    private class Pipeline {
        private var _id3 string = string.Empty

        @JsonPropertyName("id")
        prop Id string {
            get {
                return _id3
            }
            set {
                _id3 = value
            }
        }

        private var _topology string = string.Empty

        @JsonPropertyName("topology")
        prop Topology string {
            get {
                return _topology
            }
            set {
                _topology = value
            }
        }

        private var _vertexInput string = string.Empty

        @JsonPropertyName("vertexInput")
        prop VertexInput string {
            get {
                return _vertexInput
            }
            set {
                _vertexInput = value
            }
        }

        private var _pushConstants PushConstants = PushConstants()

        @JsonPropertyName("pushConstants")
        prop PushConstants PushConstants {
            get {
                return _pushConstants
            }
            set {
                _pushConstants = value
            }
        }

        @JsonPropertyName("descriptorCount")
        prop DescriptorCount int32

        private var _descriptors List[Descriptor] = List[Descriptor]()

        @JsonPropertyName("descriptors")
        prop Descriptors List[Descriptor] {
            get {
                return _descriptors
            }
            set {
                _descriptors = value
            }
        }

        private var _stages List[PipelineStage] = List[PipelineStage]()

        @JsonPropertyName("stages")
        prop Stages List[PipelineStage] {
            get {
                return _stages
            }
            set {
                _stages = value
            }
        }

        private var _colorFormat string = string.Empty

        @JsonPropertyName("colorFormat")
        prop ColorFormat string {
            get {
                return _colorFormat
            }
            set {
                _colorFormat = value
            }
        }

        @JsonPropertyName("sampleCount")
        prop SampleCount int32

        private var _blend string = string.Empty

        @JsonPropertyName("blend")
        prop Blend string {
            get {
                return _blend
            }
            set {
                _blend = value
            }
        }

        @JsonPropertyName("colorPacking")
        @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
        prop ColorPacking string?

        private var _depthStencil string = string.Empty

        @JsonPropertyName("depthStencil")
        prop DepthStencil string {
            get {
                return _depthStencil
            }
            set {
                _depthStencil = value
            }
        }

        private var _cullMode string = string.Empty

        @JsonPropertyName("cullMode")
        prop CullMode string {
            get {
                return _cullMode
            }
            set {
                _cullMode = value
            }
        }

        private var _frontFace string = string.Empty

        @JsonPropertyName("frontFace")
        prop FrontFace string {
            get {
                return _frontFace
            }
            set {
                _frontFace = value
            }
        }

        private var _hostPacking HostPacking = HostPacking()

        @JsonPropertyName("hostPacking")
        prop HostPacking HostPacking {
            get {
                return _hostPacking
            }
            set {
                _hostPacking = value
            }
        }
    }

    private class Descriptor {
        @JsonPropertyName("set")
        prop Set int32

        @JsonPropertyName("binding")
        prop Binding int32

        private var _type string = string.Empty

        @JsonPropertyName("type")
        prop Type string {
            get {
                return _type
            }
            set {
                _type = value
            }
        }

        @JsonPropertyName("count")
        prop Count int32

        private var _stages2 List[string] = List[string]()

        @JsonPropertyName("stages")
        prop Stages List[string] {
            get {
                return _stages2
            }
            set {
                _stages2 = value
            }
        }
    }

    private class PushConstants {
        @JsonPropertyName("offset")
        prop Offset int32

        @JsonPropertyName("size")
        prop Size int32

        private var _stages3 List[string] = List[string]()

        @JsonPropertyName("stages")
        prop Stages List[string] {
            get {
                return _stages3
            }
            set {
                _stages3 = value
            }
        }

        private var _members List[PushConstantMember] = List[PushConstantMember]()

        @JsonPropertyName("members")
        prop Members List[PushConstantMember] {
            get {
                return _members
            }
            set {
                _members = value
            }
        }
    }

    private class PushConstantMember {
        private var _name string = string.Empty

        @JsonPropertyName("name")
        prop Name string {
            get {
                return _name
            }
            set {
                _name = value
            }
        }

        @JsonPropertyName("offset")
        prop Offset int32

        private var _type2 string = string.Empty

        @JsonPropertyName("type")
        prop Type string {
            get {
                return _type2
            }
            set {
                _type2 = value
            }
        }
    }

    private class PrimitiveRecord {
        @JsonPropertyName("set")
        prop Set int32

        @JsonPropertyName("binding")
        prop Binding int32

        @JsonPropertyName("stride")
        prop Stride int32

        private var _stages4 List[string] = List[string]()

        @JsonPropertyName("stages")
        prop Stages List[string] {
            get {
                return _stages4
            }
            set {
                _stages4 = value
            }
        }

        private var _members2 List[PushConstantMember] = List[PushConstantMember]()

        @JsonPropertyName("members")
        prop Members List[PushConstantMember] {
            get {
                return _members2
            }
            set {
                _members2 = value
            }
        }
    }

    private class TextInstanceRecord {
        @JsonPropertyName("set")
        prop Set int32

        @JsonPropertyName("binding")
        prop Binding int32

        @JsonPropertyName("stride")
        prop Stride int32

        private var _stages5 List[string] = List[string]()

        @JsonPropertyName("stages")
        prop Stages List[string] {
            get {
                return _stages5
            }
            set {
                _stages5 = value
            }
        }

        private var _members3 List[PushConstantMember] = List[PushConstantMember]()

        @JsonPropertyName("members")
        prop Members List[PushConstantMember] {
            get {
                return _members3
            }
            set {
                _members3 = value
            }
        }

        private var _hostPacking2 HostPacking = HostPacking()

        @JsonPropertyName("hostPacking")
        prop HostPacking HostPacking {
            get {
                return _hostPacking2
            }
            set {
                _hostPacking2 = value
            }
        }
    }

    private class PipelineStage {
        private var _shader string = string.Empty

        @JsonPropertyName("shader")
        prop Shader string {
            get {
                return _shader
            }
            set {
                _shader = value
            }
        }

        private var _stage2 string = string.Empty

        @JsonPropertyName("stage")
        prop Stage string {
            get {
                return _stage2
            }
            set {
                _stage2 = value
            }
        }

        private var _entryPoint2 string = string.Empty

        @JsonPropertyName("entryPoint")
        prop EntryPoint string {
            get {
                return _entryPoint2
            }
            set {
                _entryPoint2 = value
            }
        }

        private var _inputs List[InterfaceLocation] = List[InterfaceLocation]()

        @JsonPropertyName("inputs")
        prop Inputs List[InterfaceLocation] {
            get {
                return _inputs
            }
            set {
                _inputs = value
            }
        }

        private var _outputs List[InterfaceLocation] = List[InterfaceLocation]()

        @JsonPropertyName("outputs")
        prop Outputs List[InterfaceLocation] {
            get {
                return _outputs
            }
            set {
                _outputs = value
            }
        }
    }

    private class InterfaceLocation {
        @JsonPropertyName("location")
        prop Location int32

        private var _type3 string = string.Empty

        @JsonPropertyName("type")
        prop Type string {
            get {
                return _type3
            }
            set {
                _type3 = value
            }
        }

        private var _name2 string = string.Empty

        @JsonPropertyName("name")
        prop Name string {
            get {
                return _name2
            }
            set {
                _name2 = value
            }
        }
    }

    private class BuiltShader {
        prop Spec Shader {
            get;
        }

        prop TemporaryOutput string {
            get;
        }

        prop Source[]uint8 {
            get;
        }

        prop Output[]uint8 {
            get;
        }

        prop Reflection SpirvModuleReflection {
            get;
        }

        init(spec Shader, temporaryOutput string, source[]uint8, output[]uint8, reflection SpirvModuleReflection) {
            Spec = spec
            TemporaryOutput = temporaryOutput
            Source = source
            Output = output
            Reflection = reflection
        }
    }

    private class HostPackingArtifact {
        prop Path string {
            get;
        }

        prop Packings List[HostPacking] {
            get;
        }

        prop Bytes[]uint8 {
            get;
        }

        init(packing HostPacking, bytes[]uint8) {
            Packings = List[HostPacking]()
            Path = packing.Path
            Packings.Add(packing)
            Bytes = bytes
        }
    }

    private class ToolResult {
        prop ExitCode int32 {
            get;
        }

        prop StandardOutput string {
            get;
        }

        prop StandardError string {
            get;
        }

        init(exitCode int32, standardOutput string, standardError string) {
            ExitCode = exitCode
            StandardOutput = standardOutput
            StandardError = standardError
        }
    }

    private const ShaderDirectory string = "tests/Goo.VulkanProof/Shaders"
    private const ProductionDirectory string = "Goo/Shaders/Vulkan"
    private const ManifestName string = "shader-manifest.json"
    private const HarfBuzzTag string = "14.3.1"
    private const HarfBuzzCommit string = "ab5ecbb83985034a76214ac0b2b833dcd590d774"
    private const HarfBuzzAssemblyKind string = "harfbuzz-hb-gpu-glsl"
    private const HarfBuzzProvenancePath string = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/provenance.json"
    private const HarfBuzzVertexPath string = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-vertex.glsl"
    private const HarfBuzzFragmentPath string = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-fragment.glsl"
    private const HarfBuzzDrawFragmentPath string = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-draw-fragment.glsl"
    private const HarfBuzzPaintFragmentPath string = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-paint-fragment.glsl"
    private const HarfBuzzVertexSha256 string = "a2d278b8fd6588f47e788f37f6add64e21f38a132a04f5c62e7092f4fe83a7a7"
    private const HarfBuzzFragmentSha256 string = "104eb5b9512467f8dc08c897e03168c001b5b25cccd026fc41da84f1f682c6e3"
    private const HarfBuzzDrawFragmentSha256 string = "cb70fd3b4db78d02652d0e3a419fe859b7ec5d1f30ee97cba7eaa2cf8ed404eb"
    private const HarfBuzzPaintFragmentSha256 string = "95e5868c3c1197962eb1976838b683fa2f7a7829375d170b3a59706e39538337"
    private let JsonOptions JsonSerializerOptions = JsonSerializerOptions{
        DefaultIgnoreCondition: JsonIgnoreCondition.WhenWritingNull,
        Encoder: JavaScriptEncoder.Default,
        WriteIndented: true
    }
    private let StrictUtf8 UTF8Encoding = UTF8Encoding(false, true)

    private func Main(args[]string) int32 {
        try {
            if args.Length != 1 || (args[0] != "generate" && args[0] != "check") {
                Console.Error.WriteLine("Usage: Goo.ShaderGen generate|check")
                return 2
            }
            return Execute(args[0])
        } catch (exception Exception) {
            Console.Error.WriteLine(exception.Message)
            return 1
        }
    }

    private func Execute(mode string) int32 {
        let repositoryRoot = FindRepositoryRoot()
        let shaderRoot = Path.Combine(repositoryRoot, ShaderDirectory.Replace('/', Path.DirectorySeparatorChar))
        let productionRoot = Path.Combine(repositoryRoot, ProductionDirectory.Replace('/', Path.DirectorySeparatorChar))
        let manifestPath = Path.Combine(productionRoot, ManifestName)
        let manifestBytes = File.ReadAllBytes(manifestPath)
        EnsureLf(manifestPath, manifestBytes)
        let manifest = DeserializeManifest(manifestPath, manifestBytes)
        ValidateManifest(manifest)
        ValidateAssemblyFiles(manifest, repositoryRoot)
        let canonicalInput = SerializeManifest(manifest)
        if !manifestBytes.AsSpan().SequenceEqual(Encoding.UTF8.GetBytes(canonicalInput)) {
            throw InvalidOperationException("Manifest is not canonical: $manifestPath")
        }
        let compilerPath = FindTool(manifest.Toolchain.Compiler.Executable, "SLANG_SDK")
        let compatibilityCompilerPath = FindTool(manifest.Toolchain.CompatibilityCompiler.Executable, "VULKAN_SDK")
        let validatorPath = FindTool(manifest.Toolchain.Validator.Executable, "VULKAN_SDK")
        RequireCompilerVersion(compilerPath, manifest)
        RequireCompatibilityCompilerVersion(compatibilityCompilerPath, manifest)
        RequireValidatorVersion(validatorPath, manifest)
        let temporaryRoot = Path.Combine(Path.GetTempPath(), "goo-shader-gen-" + Guid.NewGuid().ToString("N"))
        Directory.CreateDirectory(temporaryRoot)
        try {
            let builtShaders = BuildShaders(
                manifest,
                repositoryRoot,
                shaderRoot,
                temporaryRoot,
                compilerPath,
                compatibilityCompilerPath,
                validatorPath
            )
            let hostPackings = BuildHostPackings(manifest, builtShaders)
            let generatedManifest = BuildGeneratedManifest(manifest, builtShaders, hostPackings)
            let generatedManifestBytes = Encoding.UTF8.GetBytes(generatedManifest)
            if mode == "generate" {
                WriteProduction(productionRoot, builtShaders, generatedManifestBytes)
                Console.WriteLine("Generated ${builtShaders.Count} shaders and $manifestPath")
                return 0
            }
            CheckProduction(productionRoot, builtShaders, generatedManifestBytes)
            Console.WriteLine("Checked ${builtShaders.Count} shaders and $manifestPath")
            return 0
        } finally {
            if Directory.Exists(temporaryRoot) {
                Directory.Delete(temporaryRoot, true)
            }
        }
    }

    private func DeserializeManifest(path string, bytes[]uint8) Manifest {
        let manifest Manifest? = JsonSerializer.Deserialize[Manifest](bytes, JsonOptions)
        return manifest ?? throw InvalidOperationException("Manifest is empty: $path")
    }

    private func SerializeManifest(manifest Manifest) string -> JsonSerializer.Serialize(manifest, JsonOptions) + "\n"

    private func BuildGeneratedManifest(
        manifest Manifest,
        builtShaders IReadOnlyList[BuiltShader],
        hostPackings IReadOnlyList[HostPackingArtifact]
    ) string {
        for builtShader in builtShaders {
            builtShader.Spec.SourceSha256 = HashBytes(builtShader.Source)
            builtShader.Spec.OutputSha256 = HashBytes(builtShader.Output)
            builtShader.Spec.OutputBytes = builtShader.Output.LongLength
        }
        for hostPacking in hostPackings {
            let hash = HashBytes(hostPacking.Bytes)
            for packing in hostPacking.Packings {
                packing.Sha256 = hash
                packing.Bytes = hostPacking.Bytes.LongLength
            }
        }
        return SerializeManifest(manifest)
    }

    private func BuildShaders(
        manifest Manifest,
        repositoryRoot string,
        shaderRoot string,
        temporaryRoot string,
        compilerPath string,
        compatibilityCompilerPath string,
        validatorPath string
    ) List[BuiltShader] {
        let builtShaders = List[BuiltShader]()
        for shader in manifest.Shaders {
            let isGlslAssembly = shader.Assembly != nil
            let sourceBytes = if isGlslAssembly {
                AssembleShaderSource(manifest, shader, repositoryRoot)
            } else {
                ReadSourceFile(ResolveChildPath(shaderRoot, shader.Source, "source"))
            }
            let extension = if isGlslAssembly {
                ".glsl"
            } else {
                ".slang"
            }
            let temporarySource = Path.Combine(temporaryRoot, "sources", shader.Id + extension)
            Directory.CreateDirectory(Path.GetDirectoryName(temporarySource)!!)
            File.WriteAllBytes(temporarySource, sourceBytes)
            let temporaryOutput = Path.Combine(temporaryRoot, shader.Output)
            var compilerArguments List[string]
            var selectedCompilerPath string
            if isGlslAssembly {
                selectedCompilerPath = compatibilityCompilerPath
                compilerArguments = List[string](manifest.CompatibilityCompileFlags){
                    "-I",
                    shaderRoot,
                    "-fshader-stage=${shader.Stage}",
                    "-o",
                    temporaryOutput,
                    temporarySource
                }
            } else {
                selectedCompilerPath = compilerPath
                compilerArguments = List[string](manifest.CompileFlags){
                    "-std",
                    manifest.Target.SlangVersion,
                    "-lang",
                    "slang",
                    temporarySource,
                    "-I",
                    shaderRoot,
                    "-entry",
                    shader.EntryPoint,
                    "-stage",
                    shader.Stage,
                    "-o",
                    temporaryOutput
                }
            }
            let compilerResult = RunTool(selectedCompilerPath, compilerArguments)
            RequireSuccess(selectedCompilerPath, compilerResult)
            if !File.Exists(temporaryOutput) {
                throw InvalidOperationException("Compiler produced no output: ${shader.Id}")
            }
            let validatorResult = RunTool(validatorPath, []string{"--target-env", "vulkan1.3", temporaryOutput})
            RequireSuccess(validatorPath, validatorResult)
            let outputBytes = File.ReadAllBytes(temporaryOutput)
            let reflection = SpirvReflection.Read(outputBytes)
            ValidateShaderReflection(manifest, shader, reflection)
            builtShaders.Add(BuiltShader(shader, temporaryOutput, sourceBytes, outputBytes, reflection))
        }
        return builtShaders
    }

    private func ReadSourceFile(path string)[]uint8 {
        let bytes = File.ReadAllBytes(path)
        EnsureLf(path, bytes)
        return bytes
    }

    private func ValidateAssemblyFiles(manifest Manifest, repositoryRoot string) {
        for assembly in manifest.Assemblies {
            let provenancePath = ResolveRepositoryPath(repositoryRoot, assembly.Provenance, "assembly provenance")
            let provenance = ReadSourceFile(provenancePath)
            Require(
                HashBytes(provenance) == assembly.ProvenanceSha256,
                "assembly[${assembly.Id}].provenanceSha256",
                assembly.ProvenanceSha256
            )
            for part in assembly.Parts {
                let path = ResolveRepositoryPath(repositoryRoot, part.Path, "assembly part")
                let bytes = ReadSourceFile(path)
                Require(
                    HashBytes(bytes) == part.Sha256,
                    "assembly[${assembly.Id}].part[${part.Path}].sha256",
                    part.Sha256
                )
            }
        }
    }

    private func AssembleShaderSource(manifest Manifest, shader Shader, repositoryRoot string)[]uint8 {
        let assembly = manifest.Assemblies.Single((value ShaderAssembly) -> value.Id == shader.Assembly)
        let output = List[uint8]()
        AppendUtf8(output, "#version 450 core\n")
        for part in assembly.Parts {
            let path = ResolveRepositoryPath(repositoryRoot, part.Path, "assembly part")
            var partBytes = ReadSourceFile(path)
            var partText = StrictUtf8.GetString(partBytes)
            if part.Path == HarfBuzzFragmentPath {
                AppendUtf8(output, "#define HB_GPU_NO_MSAA\n#define _hb_gpu_slug gooTextSingleSample\n")
                const declaration = "uniform isamplerBuffer hb_gpu_atlas;"
                let qualified = "layout(set=${assembly.AtlasSet},binding=${assembly.AtlasBinding}) uniform isamplerBuffer hb_gpu_atlas;"
                if CountOccurrences(partText, declaration) != 1 {
                    throw InvalidOperationException("HarfBuzz atlas declaration is not unique: ${part.Path}")
                }
                partText = partText.Replace(declaration, qualified, StringComparison.Ordinal)
                partBytes = StrictUtf8.GetBytes(partText)
            }
            output.AddRange(partBytes)
            if partBytes.Length == 0 || partBytes[^1] != uint8('\n') {
                output.Add(uint8('\n'))
            }
            output.Add(uint8('\n'))
        }
        return output.ToArray()
    }

    private func CountOccurrences(text string, value string) int32 {
        var count = 0
        var offset = 0
        while (offset = text.IndexOf(value, offset, StringComparison.Ordinal)) >= 0 {
            count++
            offset += value.Length
        }
        return count
    }

    private func AppendUtf8(output List[uint8], value string) {
        output.AddRange(StrictUtf8.GetBytes(value))
    }

    private func BuildHostPackings(manifest Manifest, builtShaders IReadOnlyList[BuiltShader]) List[
        HostPackingArtifact
    ] {
        let artifacts = List[HostPackingArtifact]()
        let artifactsByPath = Dictionary[string, HostPackingArtifact](StringComparer.Ordinal)
        let AddArtifact = (
            packing HostPacking,
            packingSize int32,
            packingMembers IReadOnlyList[PushConstantMember]
        ) -> {
            let text = StringBuilder()
            AppendLf(text, "package Goo.Vulkan.Generated")
            AppendLf(text)
            AppendLf(text, "import System.Runtime.InteropServices")
            AppendLf(text)
            text.Append("@StructLayout(LayoutKind.Explicit, Size: ").Append(packingSize).Append(")\n")
            text.Append("unsafe struct ").Append(packing.TypeName).Append(" {\n")
            for var index = 0; index < packingMembers.Count; index++ {
                let expectedMember = packingMembers[index]
                AppendHostMember(text, expectedMember.Name, expectedMember.Offset, expectedMember.Type)
            }
            AppendLf(text, "}")
            let bytes = Encoding.UTF8.GetBytes(text.ToString())
            if artifactsByPath.TryGetValue(packing.Path, out var existing) {
                Require(
                    existing.Packings[0].TypeName == packing.TypeName,
                    "hostPacking[${packing.Path}].typeName",
                    existing.Packings[0].TypeName
                )
                Require(existing.Bytes.AsSpan().SequenceEqual(bytes), "hostPacking[${packing.Path}].bytes", "identical")
                existing.Packings.Add(packing)
                return
            }
            let artifact = HostPackingArtifact(packing, bytes)
            artifactsByPath.Add(packing.Path, artifact)
            artifacts.Add(artifact)
        }
        AddArtifact(
            manifest.TextInstanceRecord.HostPacking,
            manifest.TextInstanceRecord.Stride,
            manifest.TextInstanceRecord.Members
        )
        for pipeline in manifest.Pipelines {
            let vertexShader = builtShaders.Single(
                (value BuiltShader) -> value
                    .Spec
                    .Id == pipeline
                    .Stages
                    .Single((stage PipelineStage) -> stage.Stage == "vertex")
                    .Shader
            )
            var packingSize int32
            var packingMembers IReadOnlyList[PushConstantMember]
            if pipeline.PushConstants.Stages.Count > 0 {
                let pushConstant = vertexShader
                    .Reflection
                    .PushConstant ??
                    throw InvalidOperationException("Vertex shader has no reflected push constants: ${pipeline.Id}")
                let expected = pipeline.PushConstants
                Require(
                    pushConstant.Size == expected.Size,
                    "pipeline[${pipeline.Id}].hostPacking.size",
                    expected.Size.ToString()
                )
                packingSize = pushConstant.Size
                packingMembers = expected.Members
            } else {
                Require(manifest.PrimitiveRecord.Stride > 0, "primitiveRecord.stride", "positive")
                packingSize = manifest.PrimitiveRecord.Stride
                packingMembers = pipeline.PushConstants.Members
                Require(packingMembers.Count > 0, "pipeline[${pipeline.Id}].hostPacking.members", "non-empty")
            }
            AddArtifact(pipeline.HostPacking, packingSize, packingMembers)
        }
        return artifacts
    }

    private func AppendHostMember(text StringBuilder, name string, offset int32, type string) {
        let (scalarType, suffixes) = switch type {
            case "float": ("float32", []string{string.Empty})
            case "vec2": ("float32", []string{"_x", "_y"})
            case "vec3": ("float32", []string{"_x", "_y", "_z"})
            case "vec4": ("float32", []string{"_x", "_y", "_z", "_w"})
            case "mat4": (
                "float32",
                []string{
                    "_m00",
                    "_m01",
                    "_m02",
                    "_m03",
                    "_m10",
                    "_m11",
                    "_m12",
                    "_m13",
                    "_m20",
                    "_m21",
                    "_m22",
                    "_m23",
                    "_m30",
                    "_m31",
                    "_m32",
                    "_m33"
                }
            )
            case "int": ("int32", []string{string.Empty})
            case "ivec2": ("int32", []string{"_x", "_y"})
            case "ivec3": ("int32", []string{"_x", "_y", "_z"})
            case "ivec4": ("int32", []string{"_x", "_y", "_z", "_w"})
            case "uint": ("uint32", []string{string.Empty})
            case "uvec2": ("uint32", []string{"_x", "_y"})
            case "uvec3": ("uint32", []string{"_x", "_y", "_z"})
            case "uvec4": ("uint32", []string{"_x", "_y", "_z", "_w"})
            default: throw InvalidOperationException("Unsupported host packing type: $type")
        }
        for var index = 0; index < suffixes.Length; index++ {
            text
                .Append("  @FieldOffset(")
                .Append(offset + index * 4)
                .Append(") var ")
                .Append(name)
                .Append(suffixes[index])
                .Append(' ')
                .Append(scalarType)
                .Append('\n')
        }
    }

    private func AppendLf(text StringBuilder, value string = "") {
        text.Append(value).Append('\n')
    }

    private func WriteProduction(
        productionRoot string,
        builtShaders IReadOnlyList[BuiltShader],
        generatedManifestBytes[]uint8
    ) {
        Directory.CreateDirectory(productionRoot)
        for builtShader in builtShaders {
            let outputPath = ResolveChildPath(productionRoot, builtShader.Spec.Output, "production output")
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!!)
            File.WriteAllBytes(outputPath, builtShader.Output)
        }
        File.WriteAllBytes(Path.Combine(productionRoot, ManifestName), generatedManifestBytes)
    }

    private func CheckProduction(
        productionRoot string,
        builtShaders IReadOnlyList[BuiltShader],
        generatedManifestBytes[]uint8
    ) {
        RequireByteMatch(
            generatedManifestBytes,
            Path.Combine(productionRoot, ManifestName),
            "production shader manifest"
        )
        for builtShader in builtShaders {
            let productionPath = ResolveChildPath(productionRoot, builtShader.Spec.Output, "production output")
            RequireByteMatch(builtShader.Output, productionPath, "production shader")
        }
    }

    private func RequireByteMatch(expectedBytes[]uint8, actualPath string, description string) {
        if !File.Exists(actualPath) {
            throw InvalidOperationException("Missing $description: $actualPath")
        }
        let actualBytes = File.ReadAllBytes(actualPath)
        if !actualBytes.AsSpan().SequenceEqual(expectedBytes) {
            throw InvalidOperationException("$description differs: $actualPath")
        }
    }

    private func ValidateManifest(manifest Manifest) {
        Require(manifest.Schema == 5, "schema", "5")
        Require(manifest.Toolchain.Sdk == "1.4.357.0", "toolchain.sdk", "1.4.357.0")
        RequireTool(
            manifest.Toolchain.Compiler,
            "shader-slang/slang",
            "2026.16",
            "2c6ca521d2c38e7ab67c63293351bc88eb747340",
            "slangc",
            "toolchain.compiler"
        )
        RequireTool(
            manifest.Toolchain.CompatibilityCompiler,
            "google/shaderc",
            "2026.3",
            "ef2c68b4871a3c399a0808321b51379847a54673",
            "glslc",
            "toolchain.compatibilityCompiler"
        )
        RequireTool(
            manifest.Toolchain.Validator,
            "KhronosGroup/SPIRV-Tools",
            "2026.3",
            "9a49b0883b9b635689a85b5647dbfcb223268151",
            "spirv-val",
            "toolchain.validator"
        )
        Require(manifest.Target.Language == "slang", "target.language", "slang")
        Require(manifest.Target.SlangVersion == "2026", "target.slangVersion", "2026")
        Require(manifest.Target.Vulkan == "1.3", "target.vulkan", "1.3")
        Require(manifest.Target.Spirv == "1.6", "target.spirv", "1.6")
        RequireSequence(
            manifest.CompileFlags,
            []string{
                "-target",
                "spirv",
                "-capability",
                "SPIRV_1_6",
                "-matrix-layout-row-major",
                "-fp-mode",
                "precise",
                "-O2",
                "-Wall",
                "-Wpedantic",
                "-warnings-as-errors",
                "all",
                "-restrictive-capability-check",
                "-diagnostic-color",
                "never"
            },
            "compileFlags"
        )
        RequireSequence(
            manifest.CompatibilityCompileFlags,
            []string{"--target-env=vulkan1.3", "--target-spv=spv1.6", "-std=450core", "-O", "-Werror"},
            "compatibilityCompileFlags"
        )
        RequirePrimitiveRecord(manifest.PrimitiveRecord)
        RequireTextInstanceRecord(manifest.TextInstanceRecord)
        RequireDependency(
            manifest.Toolchain.Dependencies,
            "KhronosGroup/glslang",
            "16.4.0",
            "168d452a4f460d24b588fed08477a81c44ee27a1"
        )
        RequireDependency(
            manifest.Toolchain.Dependencies,
            "KhronosGroup/SPIRV-Headers",
            "1.4.357.0",
            "29981f65241605e08b0ede4cfeb999fe3b723c6a"
        )
        RequireArchive(
            manifest.Toolchain.Archives,
            "linux-x64",
            "vulkansdk-linux-x86_64-1.4.357.0.tar.xz",
            "https://sdk.lunarg.com/sdk/download/1.4.357.0/linux/vulkansdk-linux-x86_64-1.4.357.0.tar.xz",
            "0f09bf6a0625e346bf004be70b92907e934a4c76606b323441b2baf3a5a0e66d"
        )
        RequireArchive(
            manifest.Toolchain.Archives,
            "win-x64",
            "vulkansdk-windows-X64-1.4.357.0.exe",
            "https://sdk.lunarg.com/sdk/download/1.4.357.0/windows/vulkansdk-windows-X64-1.4.357.0.exe",
            "81f474711e9042f4cd22b31b2f7a8870db2e428b21586fb43dd80150be97310d"
        )
        Require(
            manifest.Toolchain.Registry.Project == "KhronosGroup/Vulkan-Headers",
            "toolchain.registry.project",
            "KhronosGroup/Vulkan-Headers"
        )
        Require(manifest.Toolchain.Registry.Version == "1.4.357.0", "toolchain.registry.version", "1.4.357.0")
        Require(
            manifest.Toolchain.Registry.Commit == "e3b1eec08173d6b825cd3ac88c885a63b621504a1",
            "toolchain.registry.commit",
            "e3b1eec08173d6b825cd3ac88c885a63b621504a1"
        )
        Require(
            manifest
                .Toolchain
                .Registry
                .VkXmlSha256 == "264d0d7350e37d70c82407fb430d085040fc01a9a961d43dec8c2d6ed1dfd183",
            "toolchain.registry.vkXmlSha256",
            "264d0d7350e37d70c82407fb430d085040fc01a9a961d43dec8c2d6ed1dfd183"
        )
        if manifest.Assemblies.Count != 3 {
            throw InvalidOperationException("assemblies must contain exactly three entries")
        }
        RequireAssembly(
            manifest.Assemblies[0],
            "hb_gpu_vertex",
            []AssemblyPart{
                AssemblyPart{Path: HarfBuzzVertexPath, Sha256: HarfBuzzVertexSha256},
                AssemblyPart{
                    Path: "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/hb_gpu.vert.wrapper.glsl",
                    Sha256: "37a82cdf392a96c35dcb6d42f0840f56621e2bfccb5f9ec43a3ce10231d52bb5"
                }
            }
        )
        RequireAssembly(
            manifest.Assemblies[1],
            "hb_gpu_draw_fragment",
            []AssemblyPart{
                AssemblyPart{Path: HarfBuzzFragmentPath, Sha256: HarfBuzzFragmentSha256},
                AssemblyPart{
                    Path: "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/shared_text_bands.glsl",
                    Sha256: "53fc83163776e503661082b7b998a28c5e6018ab62cdd7c2dbd5767058b3544c"
                },
                AssemblyPart{Path: HarfBuzzDrawFragmentPath, Sha256: HarfBuzzDrawFragmentSha256},
                AssemblyPart{
                    Path: "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/clip_chain_text.glsl",
                    Sha256: "892f76421162819caae0db0d0a29aa6b50e3fbdacfa82926b79d423cb27e0274"
                },
                AssemblyPart{
                    Path: "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/hb_gpu_draw.frag.wrapper.glsl",
                    Sha256: "7fe1b95d73f72a4492f98f798a03c0a1d4f72ceebfa08dfe499b7b4d470ca82e"
                }
            }
        )
        RequireAssembly(
            manifest.Assemblies[2],
            "hb_gpu_paint_fragment",
            []AssemblyPart{
                AssemblyPart{Path: HarfBuzzFragmentPath, Sha256: HarfBuzzFragmentSha256},
                AssemblyPart{
                    Path: "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/shared_text_bands.glsl",
                    Sha256: "53fc83163776e503661082b7b998a28c5e6018ab62cdd7c2dbd5767058b3544c"
                },
                AssemblyPart{Path: HarfBuzzDrawFragmentPath, Sha256: HarfBuzzDrawFragmentSha256},
                AssemblyPart{Path: HarfBuzzPaintFragmentPath, Sha256: HarfBuzzPaintFragmentSha256},
                AssemblyPart{
                    Path: "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/clip_chain_text.glsl",
                    Sha256: "892f76421162819caae0db0d0a29aa6b50e3fbdacfa82926b79d423cb27e0274"
                },
                AssemblyPart{
                    Path: "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/hb_gpu_paint.frag.wrapper.glsl",
                    Sha256: "7d492c19e2872bbac1a120ba17e6f2324ae3f02f02ff35dfd3cabe795c19bdd7"
                }
            }
        )
        if manifest.Shaders.Count != 17 {
            throw InvalidOperationException("shaders must contain exactly seventeen entries")
        }
        RequireShader(
            manifest.Shaders[0],
            "solid_quad_vertex",
            "vertex",
            "solid_quad.vert.slang",
            "solid_quad.vert.spv"
        )
        RequireShader(
            manifest.Shaders[1],
            "solid_quad_fragment",
            "fragment",
            "solid_quad.frag.slang",
            "solid_quad.frag.spv"
        )
        RequireShader(manifest.Shaders[2], "analytic_vertex", "vertex", "analytic.vert.slang", "analytic.vert.spv")
        RequireShader(
            manifest.Shaders[3],
            "analytic_solid_fragment",
            "fragment",
            "analytic_solid.frag.slang",
            "analytic_solid.frag.spv"
        )
        RequireShader(
            manifest.Shaders[4],
            "analytic_shadow_fragment",
            "fragment",
            "analytic_shadow.frag.slang",
            "analytic_shadow.frag.spv"
        )
        RequireShader(
            manifest.Shaders[5],
            "analytic_border_fragment",
            "fragment",
            "analytic_border.frag.slang",
            "analytic_border.frag.spv"
        )
        RequireShader(
            manifest.Shaders[6],
            "analytic_linear4_fragment",
            "fragment",
            "analytic_linear4.frag.slang",
            "analytic_linear4.frag.spv"
        )
        RequireShader(
            manifest.Shaders[7],
            "analytic_radial4_fragment",
            "fragment",
            "analytic_radial4.frag.slang",
            "analytic_radial4.frag.spv"
        )
        RequireShader(
            manifest.Shaders[8],
            "analytic_sampled_image_fragment",
            "fragment",
            "analytic_sampled_image.frag.slang",
            "analytic_sampled_image.frag.spv"
        )
        RequireShader(
            manifest.Shaders[9],
            "analytic_blend_fragment",
            "fragment",
            "analytic_blend.frag.slang",
            "analytic_blend.frag.spv"
        )
        RequireShader(manifest.Shaders[10], "path_band_vertex", "vertex", "path_band.vert.slang", "path_band.vert.spv")
        RequireShader(
            manifest.Shaders[11],
            "path_band_fragment",
            "fragment",
            "path_band.frag.slang",
            "path_band.frag.spv"
        )
        RequireShader(
            manifest.Shaders[12],
            "hb_gpu_vertex",
            "vertex",
            "hb_gpu.vert.wrapper.glsl",
            "hb_gpu.vert.spv",
            "hb_gpu_vertex"
        )
        RequireShader(
            manifest.Shaders[13],
            "hb_gpu_draw_fragment",
            "fragment",
            "hb_gpu_draw.frag.wrapper.glsl",
            "hb_gpu_draw.frag.spv",
            "hb_gpu_draw_fragment"
        )
        RequireShader(
            manifest.Shaders[14],
            "hb_gpu_paint_fragment",
            "fragment",
            "hb_gpu_paint.frag.wrapper.glsl",
            "hb_gpu_paint.frag.spv",
            "hb_gpu_paint_fragment"
        )
        RequireShader(manifest.Shaders[15], "clip_mask_vertex", "vertex", "clip_mask.vert.slang", "clip_mask.vert.spv")
        RequireShader(
            manifest.Shaders[16],
            "clip_mask_fragment",
            "fragment",
            "clip_mask.frag.slang",
            "clip_mask.frag.spv"
        )
        if manifest.Pipelines.Count != 12 {
            throw InvalidOperationException("pipelines must contain exactly twelve entries")
        }
        RequirePipeline(
            manifest.Pipelines[0],
            "solid_quad",
            "SolidQuadPushConstants.Generated.gs",
            "SolidQuadPushConstants",
            32,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "color", Offset: 16, Type: "vec4"}
            },
            []string{"vertex"},
            "disabled",
            nil,
            "solid_quad_vertex",
            "solid_quad_fragment",
            "vec4",
            "color",
            Array.Empty[Descriptor](),
            false
        )
        RequirePipeline(
            manifest.Pipelines[1],
            "analytic_solid",
            "AnalyticSolidPushConstants.Generated.gs",
            "AnalyticSolidPushConstants",
            0,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "stopPositions", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            Array.Empty[string](),
            "source-over-premultiplied-linear",
            "rgb11-11-10-alpha10-premultiplied-linear",
            "analytic_vertex",
            "analytic_solid_fragment",
            "vec2",
            "uv",
            AnalyticDescriptors()
        )
        RequirePipeline(
            manifest.Pipelines[2],
            "analytic_shadow",
            "AnalyticSolidPushConstants.Generated.gs",
            "AnalyticSolidPushConstants",
            0,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "stopPositions", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            Array.Empty[string](),
            "source-over-premultiplied-linear",
            "rgb11-11-10-alpha10-premultiplied-linear",
            "analytic_vertex",
            "analytic_shadow_fragment",
            "vec2",
            "uv",
            AnalyticDescriptors()
        )
        RequirePipeline(
            manifest.Pipelines[3],
            "analytic_border",
            "AnalyticBorderPushConstants.Generated.gs",
            "AnalyticBorderPushConstants",
            0,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "widths", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            Array.Empty[string](),
            "source-over-premultiplied-linear",
            "rgb11-11-10-alpha10-premultiplied-linear",
            "analytic_vertex",
            "analytic_border_fragment",
            "vec2",
            "uv",
            AnalyticDescriptors()
        )
        RequirePipeline(
            manifest.Pipelines[4],
            "analytic_linear4",
            "AnalyticLinear4PushConstants.Generated.gs",
            "AnalyticLinear4PushConstants",
            0,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "stopPositions", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            Array.Empty[string](),
            "source-over-premultiplied-linear",
            "rgb11-11-10-alpha10-premultiplied-linear",
            "analytic_vertex",
            "analytic_linear4_fragment",
            "vec2",
            "uv",
            AnalyticDescriptors()
        )
        RequirePipeline(
            manifest.Pipelines[5],
            "analytic_radial4",
            "AnalyticRadial4PushConstants.Generated.gs",
            "AnalyticRadial4PushConstants",
            0,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "stopPositions", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            Array.Empty[string](),
            "source-over-premultiplied-linear",
            "rgb11-11-10-alpha10-premultiplied-linear",
            "analytic_vertex",
            "analytic_radial4_fragment",
            "vec2",
            "uv",
            AnalyticDescriptors()
        )
        RequirePipeline(
            manifest.Pipelines[6],
            "analytic_sampled_image",
            "SampledImagePushConstants.Generated.gs",
            "SampledImagePushConstants",
            0,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "stopPositions", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            Array.Empty[string](),
            "source-over-premultiplied-linear",
            "straight-or-premultiplied-srgb-rgba8-sampled-to-premultiplied-linear",
            "analytic_vertex",
            "analytic_sampled_image_fragment",
            "vec2",
            "uv",
            []Descriptor{
                Descriptor{
                    Set: 0,
                    Binding: 0,
                    Type: "combined-image-sampler",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{
                    Set: 1,
                    Binding: 0,
                    Type: "combined-image-sampler",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{Set: 1, Binding: 1, Type: "storage-buffer", Count: 1, Stages: List[string]{"fragment"}},
                Descriptor{
                    Set: 2,
                    Binding: 0,
                    Type: "storage-buffer",
                    Count: 1,
                    Stages: List[string]{"vertex", "fragment"}
                }
            }
        )
        RequirePipeline(
            manifest.Pipelines[7],
            "analytic_blend",
            "SampledImagePushConstants.Generated.gs",
            "SampledImagePushConstants",
            0,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "stopPositions", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            Array.Empty[string](),
            "source-over-premultiplied-linear",
            "premultiplied-linear-source-over-css-blend",
            "analytic_vertex",
            "analytic_blend_fragment",
            "vec2",
            "uv",
            []Descriptor{
                Descriptor{
                    Set: 0,
                    Binding: 0,
                    Type: "combined-image-sampler",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{
                    Set: 1,
                    Binding: 0,
                    Type: "combined-image-sampler",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{
                    Set: 2,
                    Binding: 0,
                    Type: "storage-buffer",
                    Count: 1,
                    Stages: List[string]{"vertex", "fragment"}
                },
                Descriptor{
                    Set: 3,
                    Binding: 0,
                    Type: "combined-image-sampler",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{Set: 3, Binding: 1, Type: "storage-buffer", Count: 1, Stages: List[string]{"fragment"}}
            }
        )
        RequirePipeline(
            manifest.Pipelines[8],
            "path_band",
            "PathBandPushConstants.Generated.gs",
            "PathBandPushConstants",
            80,
            []PushConstantMember{
                PushConstantMember{Name: "transform0", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "sampleStep", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "color", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "uvec4"}
            },
            []string{"vertex", "fragment"},
            "source-over-premultiplied-linear",
            "path-band-premultiplied-linear",
            "path_band_vertex",
            "path_band_fragment",
            "vec2",
            "pathPosition",
            []Descriptor{
                Descriptor{
                    Set: 0,
                    Binding: 0,
                    Type: "storage-buffer",
                    Count: 1,
                    Stages: List[string]{"vertex", "fragment"}
                },
                Descriptor{
                    Set: 1,
                    Binding: 0,
                    Type: "combined-image-sampler",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{Set: 1, Binding: 1, Type: "storage-buffer", Count: 1, Stages: List[string]{"fragment"}}
            }
        )
        RequireHbGpuPipeline(
            manifest.Pipelines[9],
            "hb_gpu_draw",
            "HbGpuTextFrameConstants.Generated.gs",
            "HbGpuTextFrameConstants",
            "hb_gpu_vertex",
            "hb_gpu_draw_fragment"
        )
        RequireHbGpuPipeline(
            manifest.Pipelines[10],
            "hb_gpu_paint",
            "HbGpuTextFrameConstants.Generated.gs",
            "HbGpuTextFrameConstants",
            "hb_gpu_vertex",
            "hb_gpu_paint_fragment"
        )
        RequirePipeline(
            manifest.Pipelines[11],
            "clip_mask",
            "ClipMaskPushConstants.Generated.gs",
            "ClipMaskPushConstants",
            112,
            []PushConstantMember{
                PushConstantMember{Name: "transform0", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "sampleStep", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "borderRect", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "borderTransform0", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "borderTransform1", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 96, Type: "uvec4"}
            },
            []string{"vertex", "fragment"},
            "disabled",
            "clip-mask-r8-coverage",
            "clip_mask_vertex",
            "clip_mask_fragment",
            "vec2",
            "pathPosition",
            []Descriptor{
                Descriptor{
                    Set: 0,
                    Binding: 0,
                    Type: "storage-buffer",
                    Count: 1,
                    Stages: List[string]{"vertex", "fragment"}
                }
            },
            false,
            "r8-unorm"
        )
    }

    private func RequireAssembly(assembly ShaderAssembly, id string, parts IReadOnlyList[AssemblyPart]) {
        Require(assembly.Id == id, "assembly[$id].id", id)
        Require(assembly.Kind == HarfBuzzAssemblyKind, "assembly[$id].kind", HarfBuzzAssemblyKind)
        Require(assembly.Tag == HarfBuzzTag, "assembly[$id].tag", HarfBuzzTag)
        Require(assembly.Commit == HarfBuzzCommit, "assembly[$id].commit", HarfBuzzCommit)
        Require(assembly.Provenance == HarfBuzzProvenancePath, "assembly[$id].provenance", HarfBuzzProvenancePath)
        Require(
            assembly.ProvenanceSha256 == "8e6d1033c5358754101cc5000a11b39e7a7cd17926186a1140503bbe365ecb63",
            "assembly[$id].provenanceSha256",
            "8e6d1033c5358754101cc5000a11b39e7a7cd17926186a1140503bbe365ecb63"
        )
        Require(assembly.AtlasSet == 0, "assembly[$id].atlasSet", "0")
        Require(assembly.AtlasBinding == 0, "assembly[$id].atlasBinding", "0")
        if assembly.Parts.Count != parts.Count {
            throw InvalidOperationException("assembly[$id].parts must contain exactly ${parts.Count} entries")
        }
        for var index = 0; index < parts.Count; index++ {
            Require(
                assembly.Parts[index].Path == parts[index].Path,
                "assembly[$id].parts[$index].path",
                parts[index].Path
            )
            Require(
                assembly.Parts[index].Sha256 == parts[index].Sha256,
                "assembly[$id].parts[$index].sha256",
                parts[index].Sha256
            )
        }
    }

    private func RequireHbGpuPipeline(
        pipeline Pipeline,
        id string,
        hostPackingPath string,
        hostPackingTypeName string,
        vertexShader string,
        fragmentShader string
    ) {
        Require(pipeline.Id == id, "pipeline[$id].id", id)
        Require(pipeline.Topology == "triangle-list", "pipeline[$id].topology", "triangle-list")
        Require(pipeline.VertexInput == "none", "pipeline[$id].vertexInput", "none")
        Require(pipeline.DescriptorCount == 4, "pipeline[$id].descriptorCount", "4")
        RequireDescriptors(
            pipeline.Descriptors,
            []Descriptor{
                Descriptor{
                    Set: 0,
                    Binding: 0,
                    Type: "uniform-texel-buffer",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{
                    Set: 1,
                    Binding: 0,
                    Type: "combined-image-sampler",
                    Count: 1,
                    Stages: List[string]{"fragment"}
                },
                Descriptor{Set: 1, Binding: 1, Type: "storage-buffer", Count: 1, Stages: List[string]{"fragment"}},
                Descriptor{Set: 2, Binding: 0, Type: "storage-buffer", Count: 1, Stages: List[string]{"vertex"}}
            },
            "pipeline[$id].descriptors"
        )
        Require(pipeline.ColorFormat == "swapchain-sRGB", "pipeline[$id].colorFormat", "swapchain-sRGB")
        Require(pipeline.SampleCount == 1, "pipeline[$id].sampleCount", "1")
        Require(
            pipeline.Blend == "source-over-premultiplied-linear",
            "pipeline[$id].blend",
            "source-over-premultiplied-linear"
        )
        Require(
            pipeline.ColorPacking == "hb-gpu-premultiplied-linear-foreground",
            "pipeline[$id].colorPacking",
            "hb-gpu-premultiplied-linear-foreground"
        )
        Require(pipeline.DepthStencil == "disabled", "pipeline[$id].depthStencil", "disabled")
        Require(pipeline.CullMode == "none", "pipeline[$id].cullMode", "none")
        Require(pipeline.FrontFace == "counter-clockwise", "pipeline[$id].frontFace", "counter-clockwise")
        Require(pipeline.HostPacking.Path == hostPackingPath, "pipeline[$id].hostPacking.path", hostPackingPath)
        Require(
            pipeline.HostPacking.TypeName == hostPackingTypeName,
            "pipeline[$id].hostPacking.typeName",
            hostPackingTypeName
        )
        Require(pipeline.PushConstants.Offset == 0, "pipeline[$id].pushConstants.offset", "0")
        Require(pipeline.PushConstants.Size == 32, "pipeline[$id].pushConstants.size", "32")
        RequireSequence(pipeline.PushConstants.Stages, []string{"vertex"}, "pipeline[$id].pushConstants.stages")
        RequireMembers(
            pipeline.PushConstants,
            []PushConstantMember{
                PushConstantMember{Name: "viewport", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "origin", Offset: 16, Type: "vec4"}
            },
            "pipeline[$id].pushConstants.members"
        )
        if pipeline.Stages.Count != 2 {
            throw InvalidOperationException("pipeline[$id].stages must contain exactly two entries")
        }
        RequirePipelineStage(
            pipeline.Stages[0],
            vertexShader,
            "vertex",
            Array.Empty[InterfaceLocation](),
            []InterfaceLocation{
                InterfaceLocation{Location: 0, Type: "vec2", Name: "v_texcoord"},
                InterfaceLocation{Location: 1, Type: "uint", Name: "v_glyphLoc"},
                InterfaceLocation{Location: 2, Type: "uint", Name: "v_clipChainId"},
                InterfaceLocation{Location: 3, Type: "vec4", Name: "v_effectAndOrigin"},
                InterfaceLocation{Location: 4, Type: "vec4", Name: "v_foreground"}
            }
        )
        RequirePipelineStage(
            pipeline.Stages[1],
            fragmentShader,
            "fragment",
            []InterfaceLocation{
                InterfaceLocation{Location: 0, Type: "vec2", Name: "v_texcoord"},
                InterfaceLocation{Location: 1, Type: "uint", Name: "v_glyphLoc"},
                InterfaceLocation{Location: 2, Type: "uint", Name: "v_clipChainId"},
                InterfaceLocation{Location: 3, Type: "vec4", Name: "v_effectAndOrigin"},
                InterfaceLocation{Location: 4, Type: "vec4", Name: "v_foreground"}
            },
            []InterfaceLocation{InterfaceLocation{Location: 0, Type: "vec4", Name: "outColor"}}
        )
    }

    private func AnalyticDescriptors()[]Descriptor -> []Descriptor{
        Descriptor{Set: 1, Binding: 0, Type: "combined-image-sampler", Count: 1, Stages: List[string]{"fragment"}},
        Descriptor{Set: 1, Binding: 1, Type: "storage-buffer", Count: 1, Stages: List[string]{"fragment"}},
        Descriptor{Set: 2, Binding: 0, Type: "storage-buffer", Count: 1, Stages: List[string]{"vertex", "fragment"}}
    }

    private func RequirePrimitiveRecord(record PrimitiveRecord) {
        Require(record.Set == 2, "primitiveRecord.set", "2")
        Require(record.Binding == 0, "primitiveRecord.binding", "0")
        Require(record.Stride == 128, "primitiveRecord.stride", "128")
        RequireSequence(record.Stages, []string{"vertex", "fragment"}, "primitiveRecord.stages")
        RequireMembers(
            record.Members,
            []PushConstantMember{
                PushConstantMember{Name: "rect", Offset: 0, Type: "vec4"},
                PushConstantMember{Name: "transform0", Offset: 16, Type: "vec4"},
                PushConstantMember{Name: "transform1", Offset: 32, Type: "vec4"},
                PushConstantMember{Name: "radii", Offset: 48, Type: "vec4"},
                PushConstantMember{Name: "params", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "stopPositions", Offset: 80, Type: "vec4"},
                PushConstantMember{Name: "packedColors", Offset: 96, Type: "uvec4"},
                PushConstantMember{Name: "packedColorsExtra", Offset: 112, Type: "uvec4"}
            },
            "primitiveRecord.members"
        )
    }

    private func RequireTextInstanceRecord(record TextInstanceRecord) {
        Require(record.Set == 2, "textInstanceRecord.set", "2")
        Require(record.Binding == 0, "textInstanceRecord.binding", "0")
        Require(record.Stride == 128, "textInstanceRecord.stride", "128")
        RequireSequence(record.Stages, []string{"vertex"}, "textInstanceRecord.stages")
        RequireMembers(
            record.Members,
            []PushConstantMember{
                PushConstantMember{Name: "transform", Offset: 0, Type: "mat4"},
                PushConstantMember{Name: "glyphBounds", Offset: 64, Type: "vec4"},
                PushConstantMember{Name: "glyphInput", Offset: 80, Type: "uvec4"},
                PushConstantMember{Name: "foreground", Offset: 96, Type: "vec4"},
                PushConstantMember{Name: "runOrigin", Offset: 112, Type: "vec2"}
            },
            "textInstanceRecord.members"
        )
        Require(
            record.HostPacking.Path == "HbGpuTextInstanceRecord.Generated.gs",
            "textInstanceRecord.hostPacking.path",
            "HbGpuTextInstanceRecord.Generated.gs"
        )
        Require(
            record.HostPacking.TypeName == "HbGpuTextInstanceRecord",
            "textInstanceRecord.hostPacking.typeName",
            "HbGpuTextInstanceRecord"
        )
        if record.HostPacking.Path.Contains('/') || record.HostPacking.Path.Contains('\\') {
            throw InvalidOperationException("Host packing paths must be file names: textInstanceRecord")
        }
    }

    private func RequireMembers(actual PushConstants, expected IReadOnlyList[PushConstantMember], path string) {
        if actual.Members.Count != expected.Count {
            throw InvalidOperationException("$path must contain exactly ${expected.Count} entries")
        }
        for var index = 0; index < expected.Count; index++ {
            RequireMember(actual.Members[index], expected[index].Name, expected[index].Offset, expected[index].Type)
        }
    }

    private func RequireMembers(
        actual IReadOnlyList[PushConstantMember],
        expected IReadOnlyList[PushConstantMember],
        path string
    ) {
        if actual.Count != expected.Count {
            throw InvalidOperationException("$path must contain exactly ${expected.Count} entries")
        }
        for var index = 0; index < expected.Count; index++ {
            RequireMember(actual[index], expected[index].Name, expected[index].Offset, expected[index].Type)
        }
    }

    private func RequirePipeline(
        pipeline Pipeline,
        id string,
        hostPackingPath string,
        hostPackingTypeName string,
        pushConstantSize int32,
        members IReadOnlyList[PushConstantMember],
        pushStages IReadOnlyList[string],
        blend string,
        colorPacking string?,
        vertexShader string,
        fragmentShader string,
        interfaceType string,
        interfaceName string,
        descriptors IReadOnlyList[Descriptor],
        clipAware bool = true,
        colorFormat string = "swapchain-sRGB"
    ) {
        Require(pipeline.Id == id, "pipeline[$id].id", id)
        let topology = if pushStages.Count == 0 {
            "triangle-strip"
        } else {
            "triangle-list"
        }
        Require(pipeline.Topology == topology, "pipeline[$id].topology", topology)
        Require(pipeline.VertexInput == "none", "pipeline[$id].vertexInput", "none")
        Require(
            pipeline.DescriptorCount == descriptors.Count,
            "pipeline[$id].descriptorCount",
            descriptors.Count.ToString()
        )
        RequireDescriptors(pipeline.Descriptors, descriptors, "pipeline[$id].descriptors")
        Require(pipeline.ColorFormat == colorFormat, "pipeline[$id].colorFormat", colorFormat)
        Require(pipeline.SampleCount == 1, "pipeline[$id].sampleCount", "1")
        Require(pipeline.Blend == blend, "pipeline[$id].blend", blend)
        if colorPacking == nil {
            if pipeline.ColorPacking != nil {
                throw InvalidOperationException("Unexpected color packing metadata: $id")
            }
        } else {
            Require(pipeline.ColorPacking == colorPacking, "pipeline[$id].colorPacking", colorPacking)
        }
        Require(pipeline.DepthStencil == "disabled", "pipeline[$id].depthStencil", "disabled")
        Require(pipeline.CullMode == "none", "pipeline[$id].cullMode", "none")
        Require(pipeline.FrontFace == "counter-clockwise", "pipeline[$id].frontFace", "counter-clockwise")
        Require(pipeline.HostPacking.Path == hostPackingPath, "pipeline[$id].hostPacking.path", hostPackingPath)
        Require(
            pipeline.HostPacking.TypeName == hostPackingTypeName,
            "pipeline[$id].hostPacking.typeName",
            hostPackingTypeName
        )
        if pipeline.HostPacking.Path.Contains('/') || pipeline.HostPacking.Path.Contains('\\') {
            throw InvalidOperationException("Host packing paths must be file names: $id")
        }
        Require(pipeline.PushConstants.Offset == 0, "pipeline[$id].pushConstants.offset", "0")
        Require(
            pipeline.PushConstants.Size == pushConstantSize,
            "pipeline[$id].pushConstants.size",
            pushConstantSize.ToString()
        )
        RequireSequence(pipeline.PushConstants.Stages, pushStages, "pipeline[$id].pushConstants.stages")
        if pipeline.PushConstants.Members.Count != members.Count {
            throw InvalidOperationException(
                "pipeline[$id].pushConstants.members must contain exactly ${members.Count} entries"
            )
        }
        for var index = 0; index < members.Count; index++ {
            RequireMember(
                pipeline.PushConstants.Members[index],
                members[index].Name,
                members[index].Offset,
                members[index].Type
            )
        }
        if pipeline.Stages.Count != 2 {
            throw InvalidOperationException("pipeline[$id].stages must contain exactly two entries")
        }
        let vertexOutputs IReadOnlyList[InterfaceLocation] = if clipAware {
            (
                if pushStages.Count == 0 {
                    []InterfaceLocation{
                        InterfaceLocation{Location: 0, Type: interfaceType, Name: interfaceName},
                        InterfaceLocation{Location: 2, Type: "uint", Name: "gooClipDrawOrdinal"},
                        InterfaceLocation{Location: 3, Type: "uint", Name: "gooPrimitiveRecordOrdinal"}
                    }
                } else {
                    []InterfaceLocation{
                        InterfaceLocation{Location: 0, Type: interfaceType, Name: interfaceName},
                        InterfaceLocation{Location: 2, Type: "uint", Name: "gooClipDrawOrdinal"}
                    }
                }
            )
        } else {
            []InterfaceLocation{InterfaceLocation{Location: 0, Type: interfaceType, Name: interfaceName}}
        }
        RequirePipelineStage(
            pipeline.Stages[0],
            vertexShader,
            "vertex",
            Array.Empty[InterfaceLocation](),
            vertexOutputs
        )
        RequirePipelineStage(
            pipeline.Stages[1],
            fragmentShader,
            "fragment",
            vertexOutputs,
            []InterfaceLocation{InterfaceLocation{Location: 0, Type: "vec4", Name: "outColor"}}
        )
    }

    private func RequireDescriptors(actual IReadOnlyList[Descriptor], expected IReadOnlyList[Descriptor], path string) {
        if actual.Count != expected.Count {
            throw InvalidOperationException("$path count must be ${expected.Count}")
        }
        for var index = 0; index < expected.Count; index++ {
            let actualDescriptor = actual[index]
            let expectedDescriptor = expected[index]
            Require(
                actualDescriptor.Set == expectedDescriptor.Set,
                "$path[$index].set",
                expectedDescriptor.Set.ToString()
            )
            Require(
                actualDescriptor.Binding == expectedDescriptor.Binding,
                "$path[$index].binding",
                expectedDescriptor.Binding.ToString()
            )
            Require(actualDescriptor.Type == expectedDescriptor.Type, "$path[$index].type", expectedDescriptor.Type)
            Require(
                actualDescriptor.Count == expectedDescriptor.Count,
                "$path[$index].count",
                expectedDescriptor.Count.ToString()
            )
            RequireSequence(actualDescriptor.Stages, expectedDescriptor.Stages, "$path[$index].stages")
        }
    }

    private func RequireTool(tool Tool, project string, version string, commit string, executable string, path string) {
        Require(tool.Project == project, path + ".project", project)
        Require(tool.Version == version, path + ".version", version)
        Require(tool.Commit == commit, path + ".commit", commit)
        Require(tool.Executable == executable, path + ".executable", executable)
    }

    private func RequireDependency(
        dependencies IReadOnlyList[Dependency],
        project string,
        version string,
        commit string
    ) {
        let dependency Dependency? = dependencies.FirstOrDefault((candidate Dependency) -> candidate.Project == project)
        if dependency == nil {
            throw InvalidOperationException("Missing dependency: $project")
        }
        Require(dependency.Version == version, "dependency[$project].version", version)
        Require(dependency.Commit == commit, "dependency[$project].commit", commit)
    }

    private func RequireArchive(archives IReadOnlyList[Archive], rid string, file string, url string, sha256 string) {
        let archive Archive? = archives.FirstOrDefault((candidate Archive) -> candidate.Rid == rid)
        if archive == nil {
            throw InvalidOperationException("Missing archive: $rid")
        }
        Require(archive.File == file, "archive[$rid].file", file)
        Require(archive.Url == url, "archive[$rid].url", url)
        Require(archive.Sha256 == sha256, "archive[$rid].sha256", sha256)
    }

    private func RequireShader(
        shader Shader,
        id string,
        stage string,
        source string,
        output string,
        assembly string? = nil
    ) {
        Require(shader.Id == id, "shader[$id].id", id)
        Require(shader.Stage == stage, "shader[$id].stage", stage)
        Require(shader.Source == source, "shader[$id].source", source)
        Require(shader.Output == output, "shader[$id].output", output)
        Require(shader.EntryPoint == "main", "shader[$id].entryPoint", "main")
        Require(shader.Assembly == assembly, "shader[$id].assembly", assembly ?? "null")
        RequireCapabilities(
            shader.Capabilities,
            if assembly == nil || assembly == "hb_gpu_vertex" {
                []uint32{1}
            } else {
                []uint32{1, 46}
            },
            "shader[$id].capabilities"
        )
        if shader.Source.Contains('\\') || shader.Output.Contains('\\') || shader.Source.Contains('/') ||
            shader
            .Output
            .Contains('/') {
            throw InvalidOperationException("Shader paths must be file names: $id")
        }
    }

    private func RequireMember(member PushConstantMember, name string, offset int32, type string) {
        Require(member.Name == name, "pushConstant[$name].name", name)
        Require(member.Offset == offset, "pushConstant[$name].offset", offset.ToString())
        Require(member.Type == type, "pushConstant[$name].type", type)
    }

    private func RequirePipelineStage(
        actual PipelineStage,
        shader string,
        stage string,
        inputs IReadOnlyList[InterfaceLocation],
        outputs IReadOnlyList[InterfaceLocation]
    ) {
        Require(actual.Shader == shader, "pipeline.stage[$shader].shader", shader)
        Require(actual.Stage == stage, "pipeline.stage[$shader].stage", stage)
        Require(actual.EntryPoint == "main", "pipeline.stage[$shader].entryPoint", "main")
        RequireLocations(actual.Inputs, inputs, "pipeline.stage[$shader].inputs")
        RequireLocations(actual.Outputs, outputs, "pipeline.stage[$shader].outputs")
    }

    private func RequireLocations(
        actual IReadOnlyList[InterfaceLocation],
        expected IReadOnlyList[InterfaceLocation],
        path string
    ) {
        if actual.Count != expected.Count {
            throw InvalidOperationException("$path count must be ${expected.Count}")
        }
        for var index = 0; index < expected.Count; index++ {
            Require(
                actual[index].Location == expected[index].Location,
                "$path[$index].location",
                expected[index].Location.ToString()
            )
            Require(actual[index].Type == expected[index].Type, "$path[$index].type", expected[index].Type)
            Require(actual[index].Name == expected[index].Name, "$path[$index].name", expected[index].Name)
        }
    }

    private func ValidateShaderReflection(manifest Manifest, shader Shader, reflection SpirvModuleReflection) {
        Require(reflection.Stage == shader.Stage, "shader[${shader.Id}].reflection.stage", shader.Stage)
        Require(
            reflection.EntryPoint == shader.EntryPoint,
            "shader[${shader.Id}].reflection.entryPoint",
            shader.EntryPoint
        )
        RequireCapabilities(
            reflection.Capabilities,
            shader.Capabilities,
            "shader[${shader.Id}].reflection.capabilities"
        )
        let pipelines = manifest
            .Pipelines
            .Where((value Pipeline) -> value.Stages.Any((stage PipelineStage) -> stage.Shader == shader.Id))
            .ToList()
        if pipelines.Count == 0 {
            throw InvalidOperationException("Missing pipeline stage for shader: ${shader.Id}")
        }
        for pipeline in pipelines {
            let stage = pipeline.Stages.Single((value PipelineStage) -> value.Shader == shader.Id)
            RequireReflectedLocations(reflection.Inputs, stage.Inputs, "shader[${shader.Id}].reflection.inputs")
            RequireReflectedLocations(reflection.Outputs, stage.Outputs, "shader[${shader.Id}].reflection.outputs")
            let expectedDescriptors = pipeline
                .Descriptors
                .Where((value Descriptor) -> value.Stages.Contains(shader.Stage, StringComparer.Ordinal))
                .ToList()
            Require(
                reflection.DescriptorCount == expectedDescriptors.Count,
                "shader[${shader.Id}].reflection.descriptorCount",
                expectedDescriptors.Count.ToString()
            )
            RequireReflectedDescriptors(
                reflection.Descriptors,
                expectedDescriptors,
                "shader[${shader.Id}].reflection.descriptors"
            )
            let hasTextInstanceRecord = expectedDescriptors.Any(
                (value Descriptor) -> value.Set == manifest
                    .TextInstanceRecord
                    .Set &&
                    value.Binding == manifest
                    .TextInstanceRecord
                    .Binding &&
                    value
                    .Stages
                    .SequenceEqual(manifest.TextInstanceRecord.Stages, StringComparer.Ordinal)
            )
            if hasTextInstanceRecord {
                RequireTextInstanceRecordReflection(reflection, manifest.TextInstanceRecord, shader.Id)
            }
            let hasPushConstants = pipeline.PushConstants.Stages.Contains(shader.Stage, StringComparer.Ordinal)
            if !hasPushConstants {
                if reflection.PushConstant != nil {
                    throw InvalidOperationException("Shader has unexpected push constants: ${shader.Id}")
                }
                if pipeline.PushConstants.Size == 0 && expectedDescriptors.Any(
                    (value Descriptor) -> value.Set == manifest
                        .PrimitiveRecord
                        .Set &&
                        value.Binding == manifest
                        .PrimitiveRecord
                        .Binding
                ) {
                    RequirePrimitiveRecordReflection(reflection, manifest.PrimitiveRecord, shader.Id)
                }
                continue
            }
            let reflected = reflection.PushConstant ??
                throw InvalidOperationException("Shader has no reflected push constants: ${shader.Id}")
            let expected = pipeline.PushConstants
            Require(
                reflected.Size == expected.Size,
                "shader[${shader.Id}].reflection.pushConstants.size",
                expected.Size.ToString()
            )
            if reflected.Members.Count != expected.Members.Count {
                throw InvalidOperationException(
                    "shader[${shader.Id}].reflection.pushConstants.members count must be ${expected.Members.Count}"
                )
            }
            for var index = 0; index < expected.Members.Count; index++ {
                let actual = reflected.Members[index]
                let member = expected.Members[index]
                Require(
                    actual.Offset == member.Offset,
                    "shader[${shader.Id}].reflection.pushConstants.members[$index].offset",
                    member.Offset.ToString()
                )
                Require(
                    actual.Type == member.Type,
                    "shader[${shader.Id}].reflection.pushConstants.members[$index].type",
                    member.Type
                )
            }
        }
    }

    private func RequirePrimitiveRecordReflection(
        reflection SpirvModuleReflection,
        expected PrimitiveRecord,
        shaderId string
    ) {
        let actual = reflection.Descriptors.SingleOrDefault(
            (value SpirvDescriptor) -> value.Set == expected.Set && value.Binding == expected.Binding
        ) ??
            throw InvalidOperationException("Shader has no primitive record descriptor: $shaderId")
        Require(actual.Type == "storage-buffer", "shader[$shaderId].primitiveRecord.type", "storage-buffer")
        Require(
            actual.StorageStride == expected.Stride,
            "shader[$shaderId].primitiveRecord.stride",
            expected.Stride.ToString()
        )
        if actual.StorageMembers.Count != expected.Members.Count {
            throw InvalidOperationException(
                "shader[$shaderId].primitiveRecord.members count must be ${expected.Members.Count}"
            )
        }
        for var index = 0; index < expected.Members.Count; index++ {
            let actualMember = actual.StorageMembers[index]
            let expectedMember = expected.Members[index]
            Require(
                actualMember.Offset == expectedMember.Offset,
                "shader[$shaderId].primitiveRecord.members[$index].offset",
                expectedMember.Offset.ToString()
            )
            Require(
                actualMember.Type == expectedMember.Type,
                "shader[$shaderId].primitiveRecord.members[$index].type",
                expectedMember.Type
            )
        }
    }

    private func RequireTextInstanceRecordReflection(
        reflection SpirvModuleReflection,
        expected TextInstanceRecord,
        shaderId string
    ) {
        let actual = reflection.Descriptors.SingleOrDefault(
            (value SpirvDescriptor) -> value.Set == expected.Set && value.Binding == expected.Binding
        ) ??
            throw InvalidOperationException("Shader has no text instance record descriptor: $shaderId")
        Require(actual.Type == "storage-buffer", "shader[$shaderId].textInstanceRecord.type", "storage-buffer")
        Require(
            actual.StorageStride == expected.Stride,
            "shader[$shaderId].textInstanceRecord.stride",
            expected.Stride.ToString()
        )
        if actual.StorageMembers.Count != expected.Members.Count {
            throw InvalidOperationException(
                "shader[$shaderId].textInstanceRecord.members count must be ${expected.Members.Count}"
            )
        }
        for var index = 0; index < expected.Members.Count; index++ {
            let actualMember = actual.StorageMembers[index]
            let expectedMember = expected.Members[index]
            Require(
                actualMember.Offset == expectedMember.Offset,
                "shader[$shaderId].textInstanceRecord.members[$index].offset",
                expectedMember.Offset.ToString()
            )
            Require(
                actualMember.Type == expectedMember.Type,
                "shader[$shaderId].textInstanceRecord.members[$index].type",
                expectedMember.Type
            )
        }
    }

    private func RequireReflectedLocations(
        actual IReadOnlyList[SpirvInterface],
        expected IReadOnlyList[InterfaceLocation],
        path string
    ) {
        if actual.Select((value SpirvInterface) -> value.Location).Distinct().Count() != actual.Count {
            throw InvalidOperationException("$path contains duplicate locations")
        }
        if actual.Count != expected.Count {
            throw InvalidOperationException("$path count must be ${expected.Count}")
        }
        for var index = 0; index < expected.Count; index++ {
            Require(
                actual[index].Location == expected[index].Location,
                "$path[$index].location",
                expected[index].Location.ToString()
            )
            Require(actual[index].Type == expected[index].Type, "$path[$index].type", expected[index].Type)
        }
    }

    private func RequireReflectedDescriptors(
        actual IReadOnlyList[SpirvDescriptor],
        expected IReadOnlyList[Descriptor],
        path string
    ) {
        if actual.Count != expected.Count {
            throw InvalidOperationException("$path count must be ${expected.Count}")
        }
        for var index = 0; index < expected.Count; index++ {
            let actualDescriptor = actual[index]
            let expectedDescriptor = expected[index]
            Require(
                actualDescriptor.Set == expectedDescriptor.Set,
                "$path[$index].set",
                expectedDescriptor.Set.ToString()
            )
            Require(
                actualDescriptor.Binding == expectedDescriptor.Binding,
                "$path[$index].binding",
                expectedDescriptor.Binding.ToString()
            )
            Require(actualDescriptor.Type == expectedDescriptor.Type, "$path[$index].type", expectedDescriptor.Type)
            Require(
                actualDescriptor.Count == expectedDescriptor.Count,
                "$path[$index].count",
                expectedDescriptor.Count.ToString()
            )
        }
    }

    private func RequireCapabilities(actual IReadOnlyList[uint32], expected IReadOnlyList[uint32], path string) {
        if actual.Count != expected.Count {
            throw InvalidOperationException("$path count must be ${expected.Count}")
        }
        for var index = 0; index < expected.Count; index++ {
            Require(actual[index] == expected[index], "$path[$index]", expected[index].ToString())
        }
    }

    private func RequireSequence(actual IReadOnlyList[string], expected IReadOnlyList[string], path string) {
        if actual.Count != expected.Count {
            throw InvalidOperationException("$path count must be ${expected.Count}")
        }
        for var index = 0; index < expected.Count; index++ {
            Require(actual[index] == expected[index], "$path[$index]", expected[index])
        }
    }

    private func Require(condition bool, path string, expected string) {
        if !condition {
            throw InvalidOperationException("Invalid $path, expected $expected")
        }
    }

    private func FindRepositoryRoot() string {
        let starts[]string = []string{Directory.GetCurrentDirectory(), AppContext.BaseDirectory}
        for start in starts {
            var current DirectoryInfo? = DirectoryInfo(Path.GetFullPath(start))
            while current != nil {
                let manifestPath = Path.Combine(
                    current.FullName,
                    ProductionDirectory.Replace('/', Path.DirectorySeparatorChar),
                    ManifestName
                )
                if File.Exists(manifestPath) {
                    return current.FullName
                }
                current = current.Parent
            }
        }
        throw InvalidOperationException("Could not find the goo-gsharp repository root")
    }

    private func FindTool(executable string, sdkEnvironmentVariable string) string {
        let names = if OperatingSystem.IsWindows() {
            []string{executable, executable + ".exe"}
        } else {
            []string{executable}
        }
        let sdk string? = Environment.GetEnvironmentVariable(sdkEnvironmentVariable)
        if !string.IsNullOrWhiteSpace(sdk) {
            for bin in[]string{"bin", "Bin"} {
                for name in names {
                    let candidate = Path.Combine(sdk, bin, name)
                    if File.Exists(candidate) {
                        return candidate
                    }
                }
            }
        }
        let path string? = Environment.GetEnvironmentVariable("PATH")
        if !string.IsNullOrWhiteSpace(path) {
            for directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries) {
                for name in names {
                    let candidate = Path.Combine(directory, name)
                    if File.Exists(candidate) {
                        return candidate
                    }
                }
            }
        }
        throw InvalidOperationException("Could not find $executable in $sdkEnvironmentVariable or PATH")
    }

    private func RequireCompilerVersion(compilerPath string, manifest Manifest) {
        let result = RunTool(compilerPath, []string{"-version"})
        RequireSuccess(compilerPath, result)
        let output = (result.StandardOutput + result.StandardError).Trim()
        Require(output == manifest.Toolchain.Compiler.Version, "slangc.version", manifest.Toolchain.Compiler.Version)
    }

    private func RequireCompatibilityCompilerVersion(compilerPath string, manifest Manifest) {
        let result = RunTool(compilerPath, []string{"--version"})
        RequireSuccess(compilerPath, result)
        let lines = result.StandardOutput.Split([]char{'\r', '\n'}, StringSplitOptions.RemoveEmptyEntries)
        Require(
            lines.Length > 0 &&
                lines[
                0
            ].Trim() == "shaderc v${manifest.Toolchain.CompatibilityCompiler.Version} v${manifest.Toolchain.CompatibilityCompiler.Version}",
            "glslc.version",
            manifest.Toolchain.CompatibilityCompiler.Version
        )
    }

    private func RequireValidatorVersion(validatorPath string, manifest Manifest) {
        let result = RunTool(validatorPath, []string{"--version"})
        RequireSuccess(validatorPath, result)
        let output = result.StandardOutput + result.StandardError
        Require(
            output.Contains("SPIRV-Tools v${manifest.Toolchain.Validator.Version}", StringComparison.Ordinal),
            "spirv-val.version",
            manifest.Toolchain.Validator.Version
        )
        Require(
            output.Contains("vulkan-sdk-${manifest.Toolchain.Sdk}", StringComparison.Ordinal) || output.Contains(
                "g${manifest.Toolchain.Validator.Commit[..8]}",
                StringComparison.Ordinal
            ),
            "spirv-val.sdk",
            manifest.Toolchain.Sdk
        )
    }

    private func RunTool(path string, arguments IEnumerable[string]) ToolResult {
        let startInfo = ProcessStartInfo{
            FileName: path,
            UseShellExecute: false,
            RedirectStandardOutput: true,
            RedirectStandardError: true,
            CreateNoWindow: true
        }
        for argument in arguments {
            startInfo.ArgumentList.Add(argument)
        }
        using let process = Process.Start(startInfo) ?? throw InvalidOperationException("Could not start $path")
        let outputTask = process.StandardOutput.ReadToEndAsync()
        let errorTask = process.StandardError.ReadToEndAsync()
        process.WaitForExit()
        Task.WaitAll(outputTask, errorTask)
        return ToolResult(process.ExitCode, outputTask.Result, errorTask.Result)
    }

    private func RequireSuccess(path string, result ToolResult) {
        if result.ExitCode != 0 {
            let details = (result.StandardError + Environment.NewLine + result.StandardOutput).Trim()
            throw InvalidOperationException("$path failed with exit code ${result.ExitCode}: $details")
        }
    }

    private func ResolveChildPath(root string, child string, kind string) string {
        let fullPath = Path.GetFullPath(Path.Combine(root, child.Replace('/', Path.DirectorySeparatorChar)))
        let relative = Path.GetRelativePath(root, fullPath)
        if Path.IsPathRooted(relative) || relative == ".." || relative.StartsWith(
            ".." + Path.DirectorySeparatorChar,
            StringComparison.Ordinal
        ) {
            throw InvalidOperationException("$kind path escapes its directory: $child")
        }
        return fullPath
    }

    private func ResolveRepositoryPath(repositoryRoot string, child string, kind string) string -> ResolveChildPath(
        repositoryRoot,
        child,
        kind
    )

    private func EnsureLf(path string, bytes ReadOnlySpan[uint8]) {
        if bytes.IndexOf(uint8('\r')) >= 0 {
            throw InvalidOperationException("Source must use LF line endings: $path")
        }
    }

    private func HashBytes(bytes[]uint8) string -> Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()
}
