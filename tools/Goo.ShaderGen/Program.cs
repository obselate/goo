using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

internal static class Program
{
    private const string ShaderDirectory = "tests/Goo.VulkanProof/Shaders";
    private const string ProductionDirectory = "Goo/Shaders/Vulkan";
    private const string ManifestName = "shader-manifest.json";
    private const string GlslcVersionMarker = "1:";
    private const string HarfBuzzTag = "14.3.1";
    private const string HarfBuzzCommit = "ab5ecbb83985034a76214ac0b2b833dcd590d774";
    private const string HarfBuzzAssemblyKind = "harfbuzz-hb-gpu-glsl";
    private const string HarfBuzzProvenancePath = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/provenance.json";
    private const string HarfBuzzVertexPath = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-vertex.glsl";
    private const string HarfBuzzFragmentPath = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-fragment.glsl";
    private const string HarfBuzzDrawFragmentPath = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-draw-fragment.glsl";
    private const string HarfBuzzPaintFragmentPath = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-paint-fragment.glsl";
    private const string HarfBuzzVertexSha256 = "a2d278b8fd6588f47e788f37f6add64e21f38a132a04f5c62e7092f4fe83a7a7";
    private const string HarfBuzzFragmentSha256 = "104eb5b9512467f8dc08c897e03168c001b5b25cccd026fc41da84f1f682c6e3";
    private const string HarfBuzzDrawFragmentSha256 = "cb70fd3b4db78d02652d0e3a419fe859b7ec5d1f30ee97cba7eaa2cf8ed404eb";
    private const string HarfBuzzPaintFragmentSha256 = "95e5868c3c1197962eb1976838b683fa2f7a7829375d170b3a59706e39538337";

    private sealed class Manifest
    {
        [JsonPropertyName("schema")]
        public int Schema { get; set; }

        [JsonPropertyName("toolchain")]
        public Toolchain Toolchain { get; set; } = new();

        [JsonPropertyName("target")]
        public Target Target { get; set; } = new();

        [JsonPropertyName("compileFlags")]
        public List<string> CompileFlags { get; set; } = new();

        [JsonPropertyName("compatibilityCompileFlags")]
        public List<string> CompatibilityCompileFlags { get; set; } = new();

        [JsonPropertyName("primitiveRecord")]
        public PrimitiveRecord PrimitiveRecord { get; set; } = new();

        [JsonPropertyName("textInstanceRecord")]
        public TextInstanceRecord TextInstanceRecord { get; set; } = new();

        [JsonPropertyName("assemblies")]
        public List<ShaderAssembly> Assemblies { get; set; } = new();

        [JsonPropertyName("shaders")]
        public List<Shader> Shaders { get; set; } = new();

        [JsonPropertyName("pipelines")]
        public List<Pipeline> Pipelines { get; set; } = new();
    }

    private sealed class Toolchain
    {
        [JsonPropertyName("sdk")]
        public string Sdk { get; set; } = string.Empty;

        [JsonPropertyName("compiler")]
        public Tool Compiler { get; set; } = new();

        [JsonPropertyName("compatibilityCompiler")]
        public Tool CompatibilityCompiler { get; set; } = new();

        [JsonPropertyName("validator")]
        public Tool Validator { get; set; } = new();

        [JsonPropertyName("dependencies")]
        public List<Dependency> Dependencies { get; set; } = new();

        [JsonPropertyName("archives")]
        public List<Archive> Archives { get; set; } = new();

        [JsonPropertyName("registry")]
        public Registry Registry { get; set; } = new();
    }

    private sealed class Tool
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = string.Empty;

        [JsonPropertyName("version")]
        public string Version { get; set; } = string.Empty;

        [JsonPropertyName("commit")]
        public string Commit { get; set; } = string.Empty;

        [JsonPropertyName("executable")]
        public string Executable { get; set; } = string.Empty;
    }

    private sealed class Dependency
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = string.Empty;

        [JsonPropertyName("version")]
        public string Version { get; set; } = string.Empty;

        [JsonPropertyName("commit")]
        public string Commit { get; set; } = string.Empty;
    }

    private sealed class Archive
    {
        [JsonPropertyName("rid")]
        public string Rid { get; set; } = string.Empty;

        [JsonPropertyName("file")]
        public string File { get; set; } = string.Empty;

        [JsonPropertyName("url")]
        public string Url { get; set; } = string.Empty;

        [JsonPropertyName("sha256")]
        public string Sha256 { get; set; } = string.Empty;
    }

    private sealed class Registry
    {
        [JsonPropertyName("project")]
        public string Project { get; set; } = string.Empty;

        [JsonPropertyName("version")]
        public string Version { get; set; } = string.Empty;

        [JsonPropertyName("commit")]
        public string Commit { get; set; } = string.Empty;

        [JsonPropertyName("vkXmlSha256")]
        public string VkXmlSha256 { get; set; } = string.Empty;
    }

    private sealed class Target
    {
        [JsonPropertyName("language")]
        public string Language { get; set; } = string.Empty;

        [JsonPropertyName("slangVersion")]
        public string SlangVersion { get; set; } = string.Empty;

        [JsonPropertyName("vulkan")]
        public string Vulkan { get; set; } = string.Empty;

        [JsonPropertyName("spirv")]
        public string Spirv { get; set; } = string.Empty;
    }

    private sealed class Shader
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("stage")]
        public string Stage { get; set; } = string.Empty;

        [JsonPropertyName("source")]
        public string Source { get; set; } = string.Empty;

        [JsonPropertyName("output")]
        public string Output { get; set; } = string.Empty;

        [JsonPropertyName("entryPoint")]
        public string EntryPoint { get; set; } = string.Empty;

        [JsonPropertyName("assembly")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Assembly { get; set; }

        [JsonPropertyName("sourceSha256")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? SourceSha256 { get; set; }

        [JsonPropertyName("outputSha256")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? OutputSha256 { get; set; }

        [JsonPropertyName("outputBytes")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public long? OutputBytes { get; set; }

        [JsonPropertyName("capabilities")]
        public List<uint> Capabilities { get; set; } = new();
    }

    private sealed class ShaderAssembly
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("kind")]
        public string Kind { get; set; } = string.Empty;

        [JsonPropertyName("tag")]
        public string Tag { get; set; } = string.Empty;

        [JsonPropertyName("commit")]
        public string Commit { get; set; } = string.Empty;

        [JsonPropertyName("provenance")]
        public string Provenance { get; set; } = string.Empty;

        [JsonPropertyName("provenanceSha256")]
        public string ProvenanceSha256 { get; set; } = string.Empty;

        [JsonPropertyName("atlasSet")]
        public int AtlasSet { get; set; }

        [JsonPropertyName("atlasBinding")]
        public int AtlasBinding { get; set; }

        [JsonPropertyName("parts")]
        public List<AssemblyPart> Parts { get; set; } = new();
    }

    private sealed class AssemblyPart
    {
        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("sha256")]
        public string Sha256 { get; set; } = string.Empty;
    }

    private sealed class HostPacking
    {
        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("typeName")]
        public string TypeName { get; set; } = string.Empty;

        [JsonPropertyName("sha256")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Sha256 { get; set; }

        [JsonPropertyName("bytes")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public long? Bytes { get; set; }
    }

    private sealed class Pipeline
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("topology")]
        public string Topology { get; set; } = string.Empty;

        [JsonPropertyName("vertexInput")]
        public string VertexInput { get; set; } = string.Empty;

        [JsonPropertyName("pushConstants")]
        public PushConstants PushConstants { get; set; } = new();

        [JsonPropertyName("descriptorCount")]
        public int DescriptorCount { get; set; }

        [JsonPropertyName("descriptors")]
        public List<Descriptor> Descriptors { get; set; } = new();

        [JsonPropertyName("stages")]
        public List<PipelineStage> Stages { get; set; } = new();

        [JsonPropertyName("colorFormat")]
        public string ColorFormat { get; set; } = string.Empty;

        [JsonPropertyName("sampleCount")]
        public int SampleCount { get; set; }

        [JsonPropertyName("blend")]
        public string Blend { get; set; } = string.Empty;

        [JsonPropertyName("colorPacking")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ColorPacking { get; set; }

        [JsonPropertyName("depthStencil")]
        public string DepthStencil { get; set; } = string.Empty;

        [JsonPropertyName("cullMode")]
        public string CullMode { get; set; } = string.Empty;

        [JsonPropertyName("frontFace")]
        public string FrontFace { get; set; } = string.Empty;

        [JsonPropertyName("hostPacking")]
        public HostPacking HostPacking { get; set; } = new();
    }

    private sealed class Descriptor
    {
        [JsonPropertyName("set")]
        public int Set { get; set; }

        [JsonPropertyName("binding")]
        public int Binding { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("stages")]
        public List<string> Stages { get; set; } = new();
    }

    private sealed class PushConstants
    {
        [JsonPropertyName("offset")]
        public int Offset { get; set; }

        [JsonPropertyName("size")]
        public int Size { get; set; }

        [JsonPropertyName("stages")]
        public List<string> Stages { get; set; } = new();

        [JsonPropertyName("members")]
        public List<PushConstantMember> Members { get; set; } = new();
    }

    private sealed class PushConstantMember
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("offset")]
        public int Offset { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;
    }

    private sealed class PrimitiveRecord
    {
        [JsonPropertyName("set")]
        public int Set { get; set; }

        [JsonPropertyName("binding")]
        public int Binding { get; set; }

        [JsonPropertyName("stride")]
        public int Stride { get; set; }

        [JsonPropertyName("stages")]
        public List<string> Stages { get; set; } = new();

        [JsonPropertyName("members")]
        public List<PushConstantMember> Members { get; set; } = new();
    }

    private sealed class TextInstanceRecord
    {
        [JsonPropertyName("set")]
        public int Set { get; set; }

        [JsonPropertyName("binding")]
        public int Binding { get; set; }

        [JsonPropertyName("stride")]
        public int Stride { get; set; }

        [JsonPropertyName("stages")]
        public List<string> Stages { get; set; } = new();

        [JsonPropertyName("members")]
        public List<PushConstantMember> Members { get; set; } = new();

        [JsonPropertyName("hostPacking")]
        public HostPacking HostPacking { get; set; } = new();
    }

    private sealed class PipelineStage
    {
        [JsonPropertyName("shader")]
        public string Shader { get; set; } = string.Empty;

        [JsonPropertyName("stage")]
        public string Stage { get; set; } = string.Empty;

        [JsonPropertyName("entryPoint")]
        public string EntryPoint { get; set; } = string.Empty;

        [JsonPropertyName("inputs")]
        public List<InterfaceLocation> Inputs { get; set; } = new();

        [JsonPropertyName("outputs")]
        public List<InterfaceLocation> Outputs { get; set; } = new();
    }

    private sealed class InterfaceLocation
    {
        [JsonPropertyName("location")]
        public int Location { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
    }

    private sealed class BuiltShader
    {
        public Shader Spec { get; }

        public string TemporaryOutput { get; }

        public byte[] Source { get; }

        public byte[] Output { get; }

        public SpirvModuleReflection Reflection { get; }

        public BuiltShader(Shader spec, string temporaryOutput, byte[] source, byte[] output, SpirvModuleReflection reflection)
        {
            Spec = spec;
            TemporaryOutput = temporaryOutput;
            Source = source;
            Output = output;
            Reflection = reflection;
        }
    }

    private sealed class HostPackingArtifact
    {
        public string Path { get; }

        public List<HostPacking> Packings { get; } = new();

        public byte[] Bytes { get; }

        public HostPackingArtifact(HostPacking packing, byte[] bytes)
        {
            Path = packing.Path;
            Packings.Add(packing);
            Bytes = bytes;
        }
    }

    private sealed class ToolResult
    {
        public int ExitCode { get; }

        public string StandardOutput { get; }

        public string StandardError { get; }

        public ToolResult(int exitCode, string standardOutput, string standardError)
        {
            ExitCode = exitCode;
            StandardOutput = standardOutput;
            StandardError = standardError;
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.Default,
        WriteIndented = true
    };

    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    private static int Main(string[] args)
    {
        try
        {
            if (args.Length != 1 || (args[0] != "generate" && args[0] != "check"))
            {
                Console.Error.WriteLine("Usage: Goo.ShaderGen generate|check");
                return 2;
            }

            return Execute(args[0]);
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception.Message);
            return 1;
        }
    }

    private static int Execute(string mode)
    {
        string repositoryRoot = FindRepositoryRoot();
        string shaderRoot = Path.Combine(repositoryRoot, ShaderDirectory.Replace('/', Path.DirectorySeparatorChar));
        string productionRoot = Path.Combine(repositoryRoot, ProductionDirectory.Replace('/', Path.DirectorySeparatorChar));
        string manifestPath = Path.Combine(productionRoot, ManifestName);
        byte[] manifestBytes = File.ReadAllBytes(manifestPath);
        EnsureLf(manifestPath, manifestBytes);
        Manifest manifest = DeserializeManifest(manifestPath, manifestBytes);
        ValidateManifest(manifest);
        ValidateAssemblyFiles(manifest, repositoryRoot);
        string canonicalInput = SerializeManifest(manifest);
        if (!manifestBytes.AsSpan().SequenceEqual(Encoding.UTF8.GetBytes(canonicalInput)))
        {
            throw new InvalidOperationException($"Manifest is not canonical: {manifestPath}");
        }

        string compilerPath = FindTool(manifest.Toolchain.Compiler.Executable, "SLANG_SDK");
        string compatibilityCompilerPath = FindTool(manifest.Toolchain.CompatibilityCompiler.Executable, "VULKAN_SDK");
        string validatorPath = FindTool(manifest.Toolchain.Validator.Executable, "VULKAN_SDK");
        RequireCompilerVersion(compilerPath, manifest);
        RequireCompatibilityCompilerVersion(compatibilityCompilerPath, manifest);
        RequireValidatorVersion(validatorPath, manifest);
        string temporaryRoot = Path.Combine(Path.GetTempPath(), "goo-shader-gen-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temporaryRoot);
        try
        {
            List<BuiltShader> builtShaders = BuildShaders(manifest, repositoryRoot, shaderRoot, temporaryRoot, compilerPath, compatibilityCompilerPath, validatorPath);
            List<HostPackingArtifact> hostPackings = BuildHostPackings(manifest, builtShaders);
            string generatedManifest = BuildGeneratedManifest(manifest, builtShaders, hostPackings);
            byte[] generatedManifestBytes = Encoding.UTF8.GetBytes(generatedManifest);
            if (mode == "generate")
            {
                WriteProduction(productionRoot, builtShaders, generatedManifestBytes);
                Console.WriteLine($"Generated {builtShaders.Count} shaders and {manifestPath}");
                return 0;
            }

            CheckProduction(productionRoot, builtShaders, generatedManifestBytes);
            Console.WriteLine($"Checked {builtShaders.Count} shaders and {manifestPath}");
            return 0;
        }
        finally
        {
            if (Directory.Exists(temporaryRoot))
            {
                Directory.Delete(temporaryRoot, true);
            }
        }
    }

    private static Manifest DeserializeManifest(string path, byte[] bytes)
    {
        Manifest? manifest = JsonSerializer.Deserialize<Manifest>(bytes, JsonOptions);
        return manifest ?? throw new InvalidOperationException($"Manifest is empty: {path}");
    }

    private static string SerializeManifest(Manifest manifest)
    {
        return JsonSerializer.Serialize(manifest, JsonOptions) + "\n";
    }

    private static string BuildGeneratedManifest(Manifest manifest, IReadOnlyList<BuiltShader> builtShaders, IReadOnlyList<HostPackingArtifact> hostPackings)
    {
        foreach (BuiltShader builtShader in builtShaders)
        {
            builtShader.Spec.SourceSha256 = HashBytes(builtShader.Source);
            builtShader.Spec.OutputSha256 = HashBytes(builtShader.Output);
            builtShader.Spec.OutputBytes = builtShader.Output.LongLength;
        }
        foreach (HostPackingArtifact hostPacking in hostPackings)
        {
            string hash = HashBytes(hostPacking.Bytes);
            foreach (HostPacking packing in hostPacking.Packings)
            {
                packing.Sha256 = hash;
                packing.Bytes = hostPacking.Bytes.LongLength;
            }
        }
        return SerializeManifest(manifest);
    }

    private static List<BuiltShader> BuildShaders(
        Manifest manifest,
        string repositoryRoot,
        string shaderRoot,
        string temporaryRoot,
        string compilerPath,
        string compatibilityCompilerPath,
        string validatorPath)
    {
        List<BuiltShader> builtShaders = new();
        foreach (Shader shader in manifest.Shaders)
        {
            bool isGlslAssembly = shader.Assembly is not null;
            byte[] sourceBytes = isGlslAssembly
                ? AssembleShaderSource(manifest, shader, repositoryRoot)
                : ReadSourceFile(ResolveChildPath(shaderRoot, shader.Source, "source"));
            string extension = isGlslAssembly ? ".glsl" : ".slang";
            string temporarySource = Path.Combine(temporaryRoot, "sources", shader.Id + extension);
            Directory.CreateDirectory(Path.GetDirectoryName(temporarySource)!);
            File.WriteAllBytes(temporarySource, sourceBytes);
            string temporaryOutput = Path.Combine(temporaryRoot, shader.Output);
            List<string> compilerArguments;
            string selectedCompilerPath;
            if (isGlslAssembly)
            {
                selectedCompilerPath = compatibilityCompilerPath;
                compilerArguments = new List<string>(manifest.CompatibilityCompileFlags)
                {
                    "-I",
                    shaderRoot,
                    $"-fshader-stage={shader.Stage}",
                    "-o",
                    temporaryOutput,
                    temporarySource
                };
            }
            else
            {
                selectedCompilerPath = compilerPath;
                compilerArguments = new List<string>(manifest.CompileFlags)
                {
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
                };
            }
            ToolResult compilerResult = RunTool(selectedCompilerPath, compilerArguments);
            RequireSuccess(selectedCompilerPath, compilerResult);
            if (!File.Exists(temporaryOutput))
            {
                throw new InvalidOperationException($"Compiler produced no output: {shader.Id}");
            }
            ToolResult validatorResult = RunTool(validatorPath, new[] { "--target-env", "vulkan1.3", temporaryOutput });
            RequireSuccess(validatorPath, validatorResult);
            byte[] outputBytes = File.ReadAllBytes(temporaryOutput);
            SpirvModuleReflection reflection = SpirvReflection.Read(outputBytes);
            ValidateShaderReflection(manifest, shader, reflection);
            builtShaders.Add(new BuiltShader(shader, temporaryOutput, sourceBytes, outputBytes, reflection));
        }
        return builtShaders;
    }

    private static byte[] ReadSourceFile(string path)
    {
        byte[] bytes = File.ReadAllBytes(path);
        EnsureLf(path, bytes);
        return bytes;
    }

    private static void ValidateAssemblyFiles(Manifest manifest, string repositoryRoot)
    {
        foreach (ShaderAssembly assembly in manifest.Assemblies)
        {
            string provenancePath = ResolveRepositoryPath(repositoryRoot, assembly.Provenance, "assembly provenance");
            byte[] provenance = ReadSourceFile(provenancePath);
            Require(HashBytes(provenance) == assembly.ProvenanceSha256, $"assembly[{assembly.Id}].provenanceSha256", assembly.ProvenanceSha256);
            foreach (AssemblyPart part in assembly.Parts)
            {
                string path = ResolveRepositoryPath(repositoryRoot, part.Path, "assembly part");
                byte[] bytes = ReadSourceFile(path);
                Require(HashBytes(bytes) == part.Sha256, $"assembly[{assembly.Id}].part[{part.Path}].sha256", part.Sha256);
            }
        }
    }

    private static byte[] AssembleShaderSource(Manifest manifest, Shader shader, string repositoryRoot)
    {
        ShaderAssembly assembly = manifest.Assemblies.Single(value => value.Id == shader.Assembly);
        List<byte> output = new();
        AppendUtf8(output, "#version 450 core\n");
        foreach (AssemblyPart part in assembly.Parts)
        {
            string path = ResolveRepositoryPath(repositoryRoot, part.Path, "assembly part");
            byte[] partBytes = ReadSourceFile(path);
            string partText = StrictUtf8.GetString(partBytes);
            if (part.Path == HarfBuzzFragmentPath)
            {
                const string declaration = "uniform isamplerBuffer hb_gpu_atlas;";
                string qualified = $"layout(set={assembly.AtlasSet},binding={assembly.AtlasBinding}) uniform isamplerBuffer hb_gpu_atlas;";
                if (CountOccurrences(partText, declaration) != 1)
                {
                    throw new InvalidOperationException($"HarfBuzz atlas declaration is not unique: {part.Path}");
                }
                partText = partText.Replace(declaration, qualified, StringComparison.Ordinal);
                partBytes = StrictUtf8.GetBytes(partText);
            }
            output.AddRange(partBytes);
            if (partBytes.Length == 0 || partBytes[^1] != (byte)'\n')
            {
                output.Add((byte)'\n');
            }
            output.Add((byte)'\n');
        }
        return output.ToArray();
    }

    private static int CountOccurrences(string text, string value)
    {
        int count = 0;
        int offset = 0;
        while ((offset = text.IndexOf(value, offset, StringComparison.Ordinal)) >= 0)
        {
            count++;
            offset += value.Length;
        }
        return count;
    }

    private static void AppendUtf8(List<byte> output, string value)
    {
        output.AddRange(StrictUtf8.GetBytes(value));
    }

    private static List<HostPackingArtifact> BuildHostPackings(Manifest manifest, IReadOnlyList<BuiltShader> builtShaders)
    {
        List<HostPackingArtifact> artifacts = new();
        Dictionary<string, HostPackingArtifact> artifactsByPath = new(StringComparer.Ordinal);

        void AddArtifact(HostPacking packing, int packingSize, IReadOnlyList<PushConstantMember> packingMembers)
        {
            StringBuilder text = new();
            AppendLf(text, "package Goo.Vulkan.Generated");
            AppendLf(text);
            AppendLf(text, "import System.Runtime.InteropServices");
            AppendLf(text);
            text.Append("@StructLayout(LayoutKind.Explicit, Size: ").Append(packingSize).Append(")\n");
            text.Append("unsafe struct ").Append(packing.TypeName).Append(" {\n");
            for (int index = 0; index < packingMembers.Count; index++)
            {
                PushConstantMember expectedMember = packingMembers[index];
                AppendHostMember(text, expectedMember.Name, expectedMember.Offset, expectedMember.Type);
            }
            AppendLf(text, "}");
            byte[] bytes = Encoding.UTF8.GetBytes(text.ToString());
            if (artifactsByPath.TryGetValue(packing.Path, out HostPackingArtifact? existing))
            {
                Require(existing.Packings[0].TypeName == packing.TypeName, $"hostPacking[{packing.Path}].typeName", existing.Packings[0].TypeName);
                Require(existing.Bytes.AsSpan().SequenceEqual(bytes), $"hostPacking[{packing.Path}].bytes", "identical");
                existing.Packings.Add(packing);
                return;
            }
            HostPackingArtifact artifact = new(packing, bytes);
            artifactsByPath.Add(packing.Path, artifact);
            artifacts.Add(artifact);
        }

        AddArtifact(manifest.TextInstanceRecord.HostPacking, manifest.TextInstanceRecord.Stride, manifest.TextInstanceRecord.Members);
        foreach (Pipeline pipeline in manifest.Pipelines)
        {
            BuiltShader vertexShader = builtShaders.Single(value => value.Spec.Id == pipeline.Stages.Single(stage => stage.Stage == "vertex").Shader);
            int packingSize;
            IReadOnlyList<PushConstantMember> packingMembers;
            if (pipeline.PushConstants.Stages.Count > 0)
            {
                SpirvPushConstant pushConstant = vertexShader.Reflection.PushConstant
                    ?? throw new InvalidOperationException($"Vertex shader has no reflected push constants: {pipeline.Id}");
                PushConstants expected = pipeline.PushConstants;
                Require(pushConstant.Size == expected.Size, $"pipeline[{pipeline.Id}].hostPacking.size", expected.Size.ToString());
                packingSize = pushConstant.Size;
                packingMembers = expected.Members;
            }
            else
            {
                Require(manifest.PrimitiveRecord.Stride > 0, "primitiveRecord.stride", "positive");
                packingSize = manifest.PrimitiveRecord.Stride;
                packingMembers = pipeline.PushConstants.Members;
                Require(packingMembers.Count > 0, $"pipeline[{pipeline.Id}].hostPacking.members", "non-empty");
            }
            AddArtifact(pipeline.HostPacking, packingSize, packingMembers);
        }
        return artifacts;
    }

    private static void AppendHostMember(StringBuilder text, string name, int offset, string type)
    {
        (string scalarType, string[] suffixes) = type switch
        {
            "float" => ("float32", new[] { string.Empty }),
            "vec2" => ("float32", new[] { "_x", "_y" }),
            "vec3" => ("float32", new[] { "_x", "_y", "_z" }),
            "vec4" => ("float32", new[] { "_x", "_y", "_z", "_w" }),
            "mat4" => ("float32", new[] { "_m00", "_m01", "_m02", "_m03", "_m10", "_m11", "_m12", "_m13", "_m20", "_m21", "_m22", "_m23", "_m30", "_m31", "_m32", "_m33" }),
            "int" => ("int32", new[] { string.Empty }),
            "ivec2" => ("int32", new[] { "_x", "_y" }),
            "ivec3" => ("int32", new[] { "_x", "_y", "_z" }),
            "ivec4" => ("int32", new[] { "_x", "_y", "_z", "_w" }),
            "uint" => ("uint32", new[] { string.Empty }),
            "uvec2" => ("uint32", new[] { "_x", "_y" }),
            "uvec3" => ("uint32", new[] { "_x", "_y", "_z" }),
            "uvec4" => ("uint32", new[] { "_x", "_y", "_z", "_w" }),
            _ => throw new InvalidOperationException($"Unsupported host packing type: {type}")
        };
        for (int index = 0; index < suffixes.Length; index++)
        {
            text.Append("  @FieldOffset(").Append(offset + index * 4).Append(") var ")
                .Append(name).Append(suffixes[index]).Append(' ').Append(scalarType).Append('\n');
        }
    }

    private static void AppendLf(StringBuilder text, string value = "")
    {
        text.Append(value).Append('\n');
    }

    private static void WriteProduction(string productionRoot, IReadOnlyList<BuiltShader> builtShaders, byte[] generatedManifestBytes)
    {
        Directory.CreateDirectory(productionRoot);
        foreach (BuiltShader builtShader in builtShaders)
        {
            string outputPath = ResolveChildPath(productionRoot, builtShader.Spec.Output, "production output");
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
            File.WriteAllBytes(outputPath, builtShader.Output);
        }
        File.WriteAllBytes(Path.Combine(productionRoot, ManifestName), generatedManifestBytes);
    }

    private static void CheckProduction(string productionRoot, IReadOnlyList<BuiltShader> builtShaders, byte[] generatedManifestBytes)
    {
        RequireByteMatch(generatedManifestBytes, Path.Combine(productionRoot, ManifestName), "production shader manifest");
        foreach (BuiltShader builtShader in builtShaders)
        {
            string productionPath = ResolveChildPath(productionRoot, builtShader.Spec.Output, "production output");
            RequireByteMatch(builtShader.Output, productionPath, "production shader");
        }
    }

    private static void RequireByteMatch(byte[] expectedBytes, string actualPath, string description)
    {
        if (!File.Exists(actualPath))
        {
            throw new InvalidOperationException($"Missing {description}: {actualPath}");
        }
        byte[] actualBytes = File.ReadAllBytes(actualPath);
        if (!actualBytes.AsSpan().SequenceEqual(expectedBytes))
        {
            throw new InvalidOperationException($"{description} differs: {actualPath}");
        }
    }

    private static void ValidateManifest(Manifest manifest)
    {
        Require(manifest.Schema == 5, "schema", "5");
        Require(manifest.Toolchain.Sdk == "1.4.357.0", "toolchain.sdk", "1.4.357.0");
        RequireTool(manifest.Toolchain.Compiler, "shader-slang/slang", "2026.16", "2c6ca521d2c38e7ab67c63293351bc88eb747340", "slangc", "toolchain.compiler");
        RequireTool(manifest.Toolchain.CompatibilityCompiler, "google/shaderc", "2026.3", "ef2c68b4871a3c399a0808321b51379847a54673", "glslc", "toolchain.compatibilityCompiler");
        RequireTool(manifest.Toolchain.Validator, "KhronosGroup/SPIRV-Tools", "2026.3", "b707790a898e44038547df54580022fc1cf89c3d", "spirv-val", "toolchain.validator");
        Require(manifest.Target.Language == "slang", "target.language", "slang");
        Require(manifest.Target.SlangVersion == "2026", "target.slangVersion", "2026");
        Require(manifest.Target.Vulkan == "1.3", "target.vulkan", "1.3");
        Require(manifest.Target.Spirv == "1.6", "target.spirv", "1.6");
        RequireSequence(manifest.CompileFlags, new[] { "-target", "spirv", "-capability", "SPIRV_1_6", "-matrix-layout-row-major", "-fp-mode", "precise", "-O2", "-Wall", "-Wpedantic", "-warnings-as-errors", "all", "-restrictive-capability-check", "-diagnostic-color", "never" }, "compileFlags");
        RequireSequence(manifest.CompatibilityCompileFlags, new[] { "--target-env=vulkan1.3", "--target-spv=spv1.6", "-std=450core", "-O", "-Werror" }, "compatibilityCompileFlags");
        RequirePrimitiveRecord(manifest.PrimitiveRecord);
        RequireTextInstanceRecord(manifest.TextInstanceRecord);
        RequireDependency(manifest.Toolchain.Dependencies, "KhronosGroup/glslang", "16.4.0", "168d452a4f460d24b588fed08477a81c44ee27a1");
        RequireDependency(manifest.Toolchain.Dependencies, "KhronosGroup/SPIRV-Headers", "1.4.357.0", "29981f65241605e08b0ede4cfeb999fe3b723c6a");
        RequireArchive(manifest.Toolchain.Archives, "linux-x64", "vulkansdk-linux-x86_64-1.4.357.0.tar.xz", "https://sdk.lunarg.com/sdk/download/1.4.357.0/linux/vulkansdk-linux-x86_64-1.4.357.0.tar.xz", "0f09bf6a0625e346bf004be70b92907e934a4c76606b323441b2baf3a5a0e66d");
        RequireArchive(manifest.Toolchain.Archives, "win-x64", "vulkansdk-windows-X64-1.4.357.0.exe", "https://sdk.lunarg.com/sdk/download/1.4.357.0/windows/vulkansdk-windows-X64-1.4.357.0.exe", "81f474711e9042f4cd22b31b2f7a8870db2e428b21586fb43dd80150be97310d");
        Require(manifest.Toolchain.Registry.Project == "KhronosGroup/Vulkan-Headers", "toolchain.registry.project", "KhronosGroup/Vulkan-Headers");
        Require(manifest.Toolchain.Registry.Version == "1.4.357.0", "toolchain.registry.version", "1.4.357.0");
        Require(manifest.Toolchain.Registry.Commit == "e3b1eec08173d6b825cd3ac88c885a63b621504a1", "toolchain.registry.commit", "e3b1eec08173d6b825cd3ac88c885a63b621504a1");
        Require(manifest.Toolchain.Registry.VkXmlSha256 == "264d0d7350e37d70c82407fb430d085040fc01a9a961d43dec8c2d6ed1dfd183", "toolchain.registry.vkXmlSha256", "264d0d7350e37d70c82407fb430d085040fc01a9a961d43dec8c2d6ed1dfd183");
        if (manifest.Assemblies.Count != 3)
        {
            throw new InvalidOperationException("assemblies must contain exactly three entries");
        }
        RequireAssembly(manifest.Assemblies[0], "hb_gpu_vertex", new[]
        {
            new AssemblyPart { Path = HarfBuzzVertexPath, Sha256 = HarfBuzzVertexSha256 },
            new AssemblyPart { Path = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/hb_gpu.vert.wrapper.glsl", Sha256 = "128842ac415dc642e1c7a31804bf59254743df55725c34d6766890002624bf08" }
        });
        RequireAssembly(manifest.Assemblies[1], "hb_gpu_draw_fragment", new[]
        {
            new AssemblyPart { Path = HarfBuzzFragmentPath, Sha256 = HarfBuzzFragmentSha256 },
            new AssemblyPart { Path = HarfBuzzDrawFragmentPath, Sha256 = HarfBuzzDrawFragmentSha256 },
            new AssemblyPart { Path = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/clip_chain_text.glsl", Sha256 = "892f76421162819caae0db0d0a29aa6b50e3fbdacfa82926b79d423cb27e0274" },
            new AssemblyPart { Path = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/hb_gpu_draw.frag.wrapper.glsl", Sha256 = "9ea724a292a12b8bd12508581d99eb4a9a87936e06f05ee30f8036a565521be6" }
        });
        RequireAssembly(manifest.Assemblies[2], "hb_gpu_paint_fragment", new[]
        {
            new AssemblyPart { Path = HarfBuzzFragmentPath, Sha256 = HarfBuzzFragmentSha256 },
            new AssemblyPart { Path = HarfBuzzDrawFragmentPath, Sha256 = HarfBuzzDrawFragmentSha256 },
            new AssemblyPart { Path = HarfBuzzPaintFragmentPath, Sha256 = HarfBuzzPaintFragmentSha256 },
            new AssemblyPart { Path = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/clip_chain_text.glsl", Sha256 = "892f76421162819caae0db0d0a29aa6b50e3fbdacfa82926b79d423cb27e0274" },
            new AssemblyPart { Path = "tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/hb_gpu_paint.frag.wrapper.glsl", Sha256 = "7d492c19e2872bbac1a120ba17e6f2324ae3f02f02ff35dfd3cabe795c19bdd7" }
        });
        if (manifest.Shaders.Count != 17)
        {
            throw new InvalidOperationException("shaders must contain exactly seventeen entries");
        }
        RequireShader(manifest.Shaders[0], "solid_quad_vertex", "vertex", "solid_quad.vert.slang", "solid_quad.vert.spv");
        RequireShader(manifest.Shaders[1], "solid_quad_fragment", "fragment", "solid_quad.frag.slang", "solid_quad.frag.spv");
        RequireShader(manifest.Shaders[2], "analytic_vertex", "vertex", "analytic.vert.slang", "analytic.vert.spv");
        RequireShader(manifest.Shaders[3], "analytic_solid_fragment", "fragment", "analytic_solid.frag.slang", "analytic_solid.frag.spv");
        RequireShader(manifest.Shaders[4], "analytic_shadow_fragment", "fragment", "analytic_shadow.frag.slang", "analytic_shadow.frag.spv");
        RequireShader(manifest.Shaders[5], "analytic_border_fragment", "fragment", "analytic_border.frag.slang", "analytic_border.frag.spv");
        RequireShader(manifest.Shaders[6], "analytic_linear4_fragment", "fragment", "analytic_linear4.frag.slang", "analytic_linear4.frag.spv");
        RequireShader(manifest.Shaders[7], "analytic_radial4_fragment", "fragment", "analytic_radial4.frag.slang", "analytic_radial4.frag.spv");
        RequireShader(manifest.Shaders[8], "analytic_sampled_image_fragment", "fragment", "analytic_sampled_image.frag.slang", "analytic_sampled_image.frag.spv");
        RequireShader(manifest.Shaders[9], "analytic_blend_fragment", "fragment", "analytic_blend.frag.slang", "analytic_blend.frag.spv");
        RequireShader(manifest.Shaders[10], "path_band_vertex", "vertex", "path_band.vert.slang", "path_band.vert.spv");
        RequireShader(manifest.Shaders[11], "path_band_fragment", "fragment", "path_band.frag.slang", "path_band.frag.spv");
        RequireShader(manifest.Shaders[12], "hb_gpu_vertex", "vertex", "hb_gpu.vert.wrapper.glsl", "hb_gpu.vert.spv", "hb_gpu_vertex");
        RequireShader(manifest.Shaders[13], "hb_gpu_draw_fragment", "fragment", "hb_gpu_draw.frag.wrapper.glsl", "hb_gpu_draw.frag.spv", "hb_gpu_draw_fragment");
        RequireShader(manifest.Shaders[14], "hb_gpu_paint_fragment", "fragment", "hb_gpu_paint.frag.wrapper.glsl", "hb_gpu_paint.frag.spv", "hb_gpu_paint_fragment");
        RequireShader(manifest.Shaders[15], "clip_mask_vertex", "vertex", "clip_mask.vert.slang", "clip_mask.vert.spv");
        RequireShader(manifest.Shaders[16], "clip_mask_fragment", "fragment", "clip_mask.frag.slang", "clip_mask.frag.spv");
        if (manifest.Pipelines.Count != 12)
        {
            throw new InvalidOperationException("pipelines must contain exactly twelve entries");
        }
        RequirePipeline(manifest.Pipelines[0], "solid_quad", "SolidQuadPushConstants.Generated.gs", "SolidQuadPushConstants", 32, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "color", Offset = 16, Type = "vec4" }
        }, new[] { "vertex" }, "disabled", null, "solid_quad_vertex", "solid_quad_fragment", "vec4", "color", Array.Empty<Descriptor>(), false);
        RequirePipeline(manifest.Pipelines[1], "analytic_solid", "AnalyticSolidPushConstants.Generated.gs", "AnalyticSolidPushConstants", 0, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "stopPositions", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, Array.Empty<string>(), "source-over-premultiplied-linear", "rgb11-11-10-alpha10-premultiplied-linear", "analytic_vertex", "analytic_solid_fragment", "vec2", "uv", AnalyticDescriptors());
        RequirePipeline(manifest.Pipelines[2], "analytic_shadow", "AnalyticSolidPushConstants.Generated.gs", "AnalyticSolidPushConstants", 0, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "stopPositions", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, Array.Empty<string>(), "source-over-premultiplied-linear", "rgb11-11-10-alpha10-premultiplied-linear", "analytic_vertex", "analytic_shadow_fragment", "vec2", "uv", AnalyticDescriptors());
        RequirePipeline(manifest.Pipelines[3], "analytic_border", "AnalyticBorderPushConstants.Generated.gs", "AnalyticBorderPushConstants", 0, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "widths", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, Array.Empty<string>(), "source-over-premultiplied-linear", "rgb11-11-10-alpha10-premultiplied-linear", "analytic_vertex", "analytic_border_fragment", "vec2", "uv", AnalyticDescriptors());
        RequirePipeline(manifest.Pipelines[4], "analytic_linear4", "AnalyticLinear4PushConstants.Generated.gs", "AnalyticLinear4PushConstants", 0, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "stopPositions", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, Array.Empty<string>(), "source-over-premultiplied-linear", "rgb11-11-10-alpha10-premultiplied-linear", "analytic_vertex", "analytic_linear4_fragment", "vec2", "uv", AnalyticDescriptors());
        RequirePipeline(manifest.Pipelines[5], "analytic_radial4", "AnalyticRadial4PushConstants.Generated.gs", "AnalyticRadial4PushConstants", 0, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "stopPositions", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, Array.Empty<string>(), "source-over-premultiplied-linear", "rgb11-11-10-alpha10-premultiplied-linear", "analytic_vertex", "analytic_radial4_fragment", "vec2", "uv", AnalyticDescriptors());
        RequirePipeline(manifest.Pipelines[6], "analytic_sampled_image", "SampledImagePushConstants.Generated.gs", "SampledImagePushConstants", 0, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "stopPositions", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, Array.Empty<string>(), "source-over-premultiplied-linear", "straight-srgb-rgba8-sampled-to-premultiplied-linear", "analytic_vertex", "analytic_sampled_image_fragment", "vec2", "uv", new[]
        {
            new Descriptor { Set = 0, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 1, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 1, Binding = 1, Type = "storage-buffer", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 2, Binding = 0, Type = "storage-buffer", Count = 1, Stages = new List<string> { "vertex", "fragment" } }
        });
        RequirePipeline(manifest.Pipelines[7], "analytic_blend", "SampledImagePushConstants.Generated.gs", "SampledImagePushConstants", 0, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "stopPositions", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, Array.Empty<string>(), "source-over-premultiplied-linear", "premultiplied-linear-source-over-css-blend", "analytic_vertex", "analytic_blend_fragment", "vec2", "uv", new[]
        {
            new Descriptor { Set = 0, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 1, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 2, Binding = 0, Type = "storage-buffer", Count = 1, Stages = new List<string> { "vertex", "fragment" } },
            new Descriptor { Set = 3, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 3, Binding = 1, Type = "storage-buffer", Count = 1, Stages = new List<string> { "fragment" } }
        });
        RequirePipeline(manifest.Pipelines[8], "path_band", "PathBandPushConstants.Generated.gs", "PathBandPushConstants", 80, new[]
        {
            new PushConstantMember { Name = "transform0", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "sampleStep", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "color", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "uvec4" }
        }, new[] { "vertex", "fragment" }, "source-over-premultiplied-linear", "path-band-premultiplied-linear", "path_band_vertex", "path_band_fragment", "vec2", "pathPosition", new[]
        {
            new Descriptor { Set = 0, Binding = 0, Type = "storage-buffer", Count = 1, Stages = new List<string> { "vertex", "fragment" } },
            new Descriptor { Set = 1, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 1, Binding = 1, Type = "storage-buffer", Count = 1, Stages = new List<string> { "fragment" } }
        });
        RequireHbGpuPipeline(manifest.Pipelines[9], "hb_gpu_draw", "HbGpuTextFrameConstants.Generated.gs", "HbGpuTextFrameConstants", "hb_gpu_vertex", "hb_gpu_draw_fragment");
        RequireHbGpuPipeline(manifest.Pipelines[10], "hb_gpu_paint", "HbGpuTextFrameConstants.Generated.gs", "HbGpuTextFrameConstants", "hb_gpu_vertex", "hb_gpu_paint_fragment");
        RequirePipeline(manifest.Pipelines[11], "clip_mask", "ClipMaskPushConstants.Generated.gs", "ClipMaskPushConstants", 112, new[]
        {
            new PushConstantMember { Name = "transform0", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "sampleStep", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "borderRect", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "borderTransform0", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "borderTransform1", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 96, Type = "uvec4" }
        }, new[] { "vertex", "fragment" }, "disabled", "clip-mask-r8-coverage", "clip_mask_vertex", "clip_mask_fragment", "vec2", "pathPosition", new[]
        {
            new Descriptor { Set = 0, Binding = 0, Type = "storage-buffer", Count = 1, Stages = new List<string> { "vertex", "fragment" } }
        }, false, "r8-unorm");

    }

    private static void RequireAssembly(ShaderAssembly assembly, string id, IReadOnlyList<AssemblyPart> parts)
    {
        Require(assembly.Id == id, $"assembly[{id}].id", id);
        Require(assembly.Kind == HarfBuzzAssemblyKind, $"assembly[{id}].kind", HarfBuzzAssemblyKind);
        Require(assembly.Tag == HarfBuzzTag, $"assembly[{id}].tag", HarfBuzzTag);
        Require(assembly.Commit == HarfBuzzCommit, $"assembly[{id}].commit", HarfBuzzCommit);
        Require(assembly.Provenance == HarfBuzzProvenancePath, $"assembly[{id}].provenance", HarfBuzzProvenancePath);
        Require(assembly.ProvenanceSha256 == "8e6d1033c5358754101cc5000a11b39e7a7cd17926186a1140503bbe365ecb63", $"assembly[{id}].provenanceSha256", "8e6d1033c5358754101cc5000a11b39e7a7cd17926186a1140503bbe365ecb63");
        Require(assembly.AtlasSet == 0, $"assembly[{id}].atlasSet", "0");
        Require(assembly.AtlasBinding == 0, $"assembly[{id}].atlasBinding", "0");
        if (assembly.Parts.Count != parts.Count)
        {
            throw new InvalidOperationException($"assembly[{id}].parts must contain exactly {parts.Count} entries");
        }
        for (int index = 0; index < parts.Count; index++)
        {
            Require(assembly.Parts[index].Path == parts[index].Path, $"assembly[{id}].parts[{index}].path", parts[index].Path);
            Require(assembly.Parts[index].Sha256 == parts[index].Sha256, $"assembly[{id}].parts[{index}].sha256", parts[index].Sha256);
        }
    }

    private static void RequireHbGpuPipeline(Pipeline pipeline, string id, string hostPackingPath, string hostPackingTypeName, string vertexShader, string fragmentShader)
    {
        Require(pipeline.Id == id, $"pipeline[{id}].id", id);
        Require(pipeline.Topology == "triangle-list", $"pipeline[{id}].topology", "triangle-list");
        Require(pipeline.VertexInput == "none", $"pipeline[{id}].vertexInput", "none");
        Require(pipeline.DescriptorCount == 4, $"pipeline[{id}].descriptorCount", "4");
        RequireDescriptors(pipeline.Descriptors, new[]
        {
            new Descriptor { Set = 0, Binding = 0, Type = "uniform-texel-buffer", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 1, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 1, Binding = 1, Type = "storage-buffer", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 2, Binding = 0, Type = "storage-buffer", Count = 1, Stages = new List<string> { "vertex" } }
        }, $"pipeline[{id}].descriptors");
        Require(pipeline.ColorFormat == "swapchain-sRGB", $"pipeline[{id}].colorFormat", "swapchain-sRGB");
        Require(pipeline.SampleCount == 1, $"pipeline[{id}].sampleCount", "1");
        Require(pipeline.Blend == "source-over-premultiplied-linear", $"pipeline[{id}].blend", "source-over-premultiplied-linear");
        Require(pipeline.ColorPacking == "hb-gpu-premultiplied-linear-foreground", $"pipeline[{id}].colorPacking", "hb-gpu-premultiplied-linear-foreground");
        Require(pipeline.DepthStencil == "disabled", $"pipeline[{id}].depthStencil", "disabled");
        Require(pipeline.CullMode == "none", $"pipeline[{id}].cullMode", "none");
        Require(pipeline.FrontFace == "counter-clockwise", $"pipeline[{id}].frontFace", "counter-clockwise");
        Require(pipeline.HostPacking.Path == hostPackingPath, $"pipeline[{id}].hostPacking.path", hostPackingPath);
        Require(pipeline.HostPacking.TypeName == hostPackingTypeName, $"pipeline[{id}].hostPacking.typeName", hostPackingTypeName);
        Require(pipeline.PushConstants.Offset == 0, $"pipeline[{id}].pushConstants.offset", "0");
        Require(pipeline.PushConstants.Size == 32, $"pipeline[{id}].pushConstants.size", "32");
        RequireSequence(pipeline.PushConstants.Stages, new[] { "vertex" }, $"pipeline[{id}].pushConstants.stages");
        RequireMembers(pipeline.PushConstants, new[]
        {
            new PushConstantMember { Name = "viewport", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "origin", Offset = 16, Type = "vec4" }
        }, $"pipeline[{id}].pushConstants.members");
        if (pipeline.Stages.Count != 2)
        {
            throw new InvalidOperationException($"pipeline[{id}].stages must contain exactly two entries");
        }
        RequirePipelineStage(pipeline.Stages[0], vertexShader, "vertex", Array.Empty<InterfaceLocation>(), new[]
        {
            new InterfaceLocation { Location = 0, Type = "vec2", Name = "v_texcoord" },
            new InterfaceLocation { Location = 1, Type = "uint", Name = "v_glyphLoc" },
            new InterfaceLocation { Location = 2, Type = "uint", Name = "v_clipChainId" },
            new InterfaceLocation { Location = 3, Type = "vec4", Name = "v_effectAndOrigin" },
            new InterfaceLocation { Location = 4, Type = "vec4", Name = "v_foreground" }
        });
        RequirePipelineStage(pipeline.Stages[1], fragmentShader, "fragment", new[]
        {
            new InterfaceLocation { Location = 0, Type = "vec2", Name = "v_texcoord" },
            new InterfaceLocation { Location = 1, Type = "uint", Name = "v_glyphLoc" },
            new InterfaceLocation { Location = 2, Type = "uint", Name = "v_clipChainId" },
            new InterfaceLocation { Location = 3, Type = "vec4", Name = "v_effectAndOrigin" },
            new InterfaceLocation { Location = 4, Type = "vec4", Name = "v_foreground" }
        }, new[] { new InterfaceLocation { Location = 0, Type = "vec4", Name = "outColor" } });
    }

    private static Descriptor[] AnalyticDescriptors()
    {
        return new[]
        {
            new Descriptor { Set = 1, Binding = 0, Type = "combined-image-sampler", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 1, Binding = 1, Type = "storage-buffer", Count = 1, Stages = new List<string> { "fragment" } },
            new Descriptor { Set = 2, Binding = 0, Type = "storage-buffer", Count = 1, Stages = new List<string> { "vertex", "fragment" } }
        };
    }

    private static void RequirePrimitiveRecord(PrimitiveRecord record)
    {
        Require(record.Set == 2, "primitiveRecord.set", "2");
        Require(record.Binding == 0, "primitiveRecord.binding", "0");
        Require(record.Stride == 128, "primitiveRecord.stride", "128");
        RequireSequence(record.Stages, new[] { "vertex", "fragment" }, "primitiveRecord.stages");
        RequireMembers(record.Members, new[]
        {
            new PushConstantMember { Name = "rect", Offset = 0, Type = "vec4" },
            new PushConstantMember { Name = "transform0", Offset = 16, Type = "vec4" },
            new PushConstantMember { Name = "transform1", Offset = 32, Type = "vec4" },
            new PushConstantMember { Name = "radii", Offset = 48, Type = "vec4" },
            new PushConstantMember { Name = "params", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "stopPositions", Offset = 80, Type = "vec4" },
            new PushConstantMember { Name = "packedColors", Offset = 96, Type = "uvec4" },
            new PushConstantMember { Name = "packedColorsExtra", Offset = 112, Type = "uvec4" }
        }, "primitiveRecord.members");
    }
    private static void RequireTextInstanceRecord(TextInstanceRecord record)
    {
        Require(record.Set == 2, "textInstanceRecord.set", "2");
        Require(record.Binding == 0, "textInstanceRecord.binding", "0");
        Require(record.Stride == 112, "textInstanceRecord.stride", "112");
        RequireSequence(record.Stages, new[] { "vertex" }, "textInstanceRecord.stages");
        RequireMembers(record.Members, new[]
        {
            new PushConstantMember { Name = "transform", Offset = 0, Type = "mat4" },
            new PushConstantMember { Name = "glyphBounds", Offset = 64, Type = "vec4" },
            new PushConstantMember { Name = "glyphInput", Offset = 80, Type = "uvec4" },
            new PushConstantMember { Name = "foreground", Offset = 96, Type = "vec4" }
        }, "textInstanceRecord.members");
        Require(record.HostPacking.Path == "HbGpuTextInstanceRecord.Generated.gs", "textInstanceRecord.hostPacking.path", "HbGpuTextInstanceRecord.Generated.gs");
        Require(record.HostPacking.TypeName == "HbGpuTextInstanceRecord", "textInstanceRecord.hostPacking.typeName", "HbGpuTextInstanceRecord");
        if (record.HostPacking.Path.Contains('/') || record.HostPacking.Path.Contains('\\'))
        {
            throw new InvalidOperationException("Host packing paths must be file names: textInstanceRecord");
        }
    }

    private static void RequireMembers(PushConstants actual, IReadOnlyList<PushConstantMember> expected, string path)
    {
        if (actual.Members.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} must contain exactly {expected.Count} entries");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            RequireMember(actual.Members[index], expected[index].Name, expected[index].Offset, expected[index].Type);
        }
    }

    private static void RequireMembers(IReadOnlyList<PushConstantMember> actual, IReadOnlyList<PushConstantMember> expected, string path)
    {
        if (actual.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} must contain exactly {expected.Count} entries");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            RequireMember(actual[index], expected[index].Name, expected[index].Offset, expected[index].Type);
        }
    }

    private static void RequirePipeline(Pipeline pipeline, string id, string hostPackingPath, string hostPackingTypeName, int pushConstantSize, IReadOnlyList<PushConstantMember> members, IReadOnlyList<string> pushStages, string blend, string? colorPacking, string vertexShader, string fragmentShader, string interfaceType, string interfaceName, IReadOnlyList<Descriptor> descriptors, bool clipAware = true, string colorFormat = "swapchain-sRGB")
    {
        Require(pipeline.Id == id, $"pipeline[{id}].id", id);
        string topology = pushStages.Count == 0 ? "triangle-strip" : "triangle-list";
        Require(pipeline.Topology == topology, $"pipeline[{id}].topology", topology);
        Require(pipeline.VertexInput == "none", $"pipeline[{id}].vertexInput", "none");
        Require(pipeline.DescriptorCount == descriptors.Count, $"pipeline[{id}].descriptorCount", descriptors.Count.ToString());
        RequireDescriptors(pipeline.Descriptors, descriptors, $"pipeline[{id}].descriptors");
        Require(pipeline.ColorFormat == colorFormat, $"pipeline[{id}].colorFormat", colorFormat);
        Require(pipeline.SampleCount == 1, $"pipeline[{id}].sampleCount", "1");
        Require(pipeline.Blend == blend, $"pipeline[{id}].blend", blend);
        if (colorPacking is null)
        {
            if (pipeline.ColorPacking is not null)
            {
                throw new InvalidOperationException($"Unexpected color packing metadata: {id}");
            }
        }
        else
        {
            Require(pipeline.ColorPacking == colorPacking, $"pipeline[{id}].colorPacking", colorPacking);
        }
        Require(pipeline.DepthStencil == "disabled", $"pipeline[{id}].depthStencil", "disabled");
        Require(pipeline.CullMode == "none", $"pipeline[{id}].cullMode", "none");
        Require(pipeline.FrontFace == "counter-clockwise", $"pipeline[{id}].frontFace", "counter-clockwise");
        Require(pipeline.HostPacking.Path == hostPackingPath, $"pipeline[{id}].hostPacking.path", hostPackingPath);
        Require(pipeline.HostPacking.TypeName == hostPackingTypeName, $"pipeline[{id}].hostPacking.typeName", hostPackingTypeName);
        if (pipeline.HostPacking.Path.Contains('/') || pipeline.HostPacking.Path.Contains('\\'))
        {
            throw new InvalidOperationException($"Host packing paths must be file names: {id}");
        }
        Require(pipeline.PushConstants.Offset == 0, $"pipeline[{id}].pushConstants.offset", "0");
        Require(pipeline.PushConstants.Size == pushConstantSize, $"pipeline[{id}].pushConstants.size", pushConstantSize.ToString());
        RequireSequence(pipeline.PushConstants.Stages, pushStages, $"pipeline[{id}].pushConstants.stages");
        if (pipeline.PushConstants.Members.Count != members.Count)
        {
            throw new InvalidOperationException($"pipeline[{id}].pushConstants.members must contain exactly {members.Count} entries");
        }
        for (int index = 0; index < members.Count; index++)
        {
            RequireMember(pipeline.PushConstants.Members[index], members[index].Name, members[index].Offset, members[index].Type);
        }
        if (pipeline.Stages.Count != 2)
        {
            throw new InvalidOperationException($"pipeline[{id}].stages must contain exactly two entries");
        }
        IReadOnlyList<InterfaceLocation> vertexOutputs = clipAware
            ? pushStages.Count == 0
                ? new[]
                {
                    new InterfaceLocation { Location = 0, Type = interfaceType, Name = interfaceName },
                    new InterfaceLocation { Location = 2, Type = "uint", Name = "gooClipDrawOrdinal" },
                    new InterfaceLocation { Location = 3, Type = "uint", Name = "gooPrimitiveRecordOrdinal" }
                }
                : new[]
                {
                    new InterfaceLocation { Location = 0, Type = interfaceType, Name = interfaceName },
                    new InterfaceLocation { Location = 2, Type = "uint", Name = "gooClipDrawOrdinal" }
                }
            : new[] { new InterfaceLocation { Location = 0, Type = interfaceType, Name = interfaceName } };
        RequirePipelineStage(pipeline.Stages[0], vertexShader, "vertex", Array.Empty<InterfaceLocation>(), vertexOutputs);
        RequirePipelineStage(pipeline.Stages[1], fragmentShader, "fragment", vertexOutputs, new[] { new InterfaceLocation { Location = 0, Type = "vec4", Name = "outColor" } });
    }

    private static void RequireDescriptors(IReadOnlyList<Descriptor> actual, IReadOnlyList<Descriptor> expected, string path)
    {
        if (actual.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} count must be {expected.Count}");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            Descriptor actualDescriptor = actual[index];
            Descriptor expectedDescriptor = expected[index];
            Require(actualDescriptor.Set == expectedDescriptor.Set, $"{path}[{index}].set", expectedDescriptor.Set.ToString());
            Require(actualDescriptor.Binding == expectedDescriptor.Binding, $"{path}[{index}].binding", expectedDescriptor.Binding.ToString());
            Require(actualDescriptor.Type == expectedDescriptor.Type, $"{path}[{index}].type", expectedDescriptor.Type);
            Require(actualDescriptor.Count == expectedDescriptor.Count, $"{path}[{index}].count", expectedDescriptor.Count.ToString());
            RequireSequence(actualDescriptor.Stages, expectedDescriptor.Stages, $"{path}[{index}].stages");
        }
    }

    private static void RequireTool(Tool tool, string project, string version, string commit, string executable, string path)
    {
        Require(tool.Project == project, path + ".project", project);
        Require(tool.Version == version, path + ".version", version);
        Require(tool.Commit == commit, path + ".commit", commit);
        Require(tool.Executable == executable, path + ".executable", executable);
    }

    private static void RequireDependency(IReadOnlyList<Dependency> dependencies, string project, string version, string commit)
    {
        Dependency? dependency = dependencies.FirstOrDefault(candidate => candidate.Project == project);
        if (dependency is null)
        {
            throw new InvalidOperationException($"Missing dependency: {project}");
        }
        Require(dependency.Version == version, $"dependency[{project}].version", version);
        Require(dependency.Commit == commit, $"dependency[{project}].commit", commit);
    }

    private static void RequireArchive(IReadOnlyList<Archive> archives, string rid, string file, string url, string sha256)
    {
        Archive? archive = archives.FirstOrDefault(candidate => candidate.Rid == rid);
        if (archive is null)
        {
            throw new InvalidOperationException($"Missing archive: {rid}");
        }
        Require(archive.File == file, $"archive[{rid}].file", file);
        Require(archive.Url == url, $"archive[{rid}].url", url);
        Require(archive.Sha256 == sha256, $"archive[{rid}].sha256", sha256);
    }

    private static void RequireShader(Shader shader, string id, string stage, string source, string output, string? assembly = null)
    {
        Require(shader.Id == id, $"shader[{id}].id", id);
        Require(shader.Stage == stage, $"shader[{id}].stage", stage);
        Require(shader.Source == source, $"shader[{id}].source", source);
        Require(shader.Output == output, $"shader[{id}].output", output);
        Require(shader.EntryPoint == "main", $"shader[{id}].entryPoint", "main");
        Require(shader.Assembly == assembly, $"shader[{id}].assembly", assembly ?? "null");
        RequireCapabilities(shader.Capabilities, assembly is null || assembly == "hb_gpu_vertex" ? new uint[] { 1 } : new uint[] { 1, 46 }, $"shader[{id}].capabilities");
        if (shader.Source.Contains('\\') || shader.Output.Contains('\\') || shader.Source.Contains('/') || shader.Output.Contains('/'))
        {
            throw new InvalidOperationException($"Shader paths must be file names: {id}");
        }
    }

    private static void RequireMember(PushConstantMember member, string name, int offset, string type)
    {
        Require(member.Name == name, $"pushConstant[{name}].name", name);
        Require(member.Offset == offset, $"pushConstant[{name}].offset", offset.ToString());
        Require(member.Type == type, $"pushConstant[{name}].type", type);
    }

    private static void RequirePipelineStage(PipelineStage actual, string shader, string stage, IReadOnlyList<InterfaceLocation> inputs, IReadOnlyList<InterfaceLocation> outputs)
    {
        Require(actual.Shader == shader, $"pipeline.stage[{shader}].shader", shader);
        Require(actual.Stage == stage, $"pipeline.stage[{shader}].stage", stage);
        Require(actual.EntryPoint == "main", $"pipeline.stage[{shader}].entryPoint", "main");
        RequireLocations(actual.Inputs, inputs, $"pipeline.stage[{shader}].inputs");
        RequireLocations(actual.Outputs, outputs, $"pipeline.stage[{shader}].outputs");
    }

    private static void RequireLocations(IReadOnlyList<InterfaceLocation> actual, IReadOnlyList<InterfaceLocation> expected, string path)
    {
        if (actual.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} count must be {expected.Count}");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            Require(actual[index].Location == expected[index].Location, $"{path}[{index}].location", expected[index].Location.ToString());
            Require(actual[index].Type == expected[index].Type, $"{path}[{index}].type", expected[index].Type);
            Require(actual[index].Name == expected[index].Name, $"{path}[{index}].name", expected[index].Name);
        }
    }

    private static void ValidateShaderReflection(Manifest manifest, Shader shader, SpirvModuleReflection reflection)
    {
        Require(reflection.Stage == shader.Stage, $"shader[{shader.Id}].reflection.stage", shader.Stage);
        Require(reflection.EntryPoint == shader.EntryPoint, $"shader[{shader.Id}].reflection.entryPoint", shader.EntryPoint);
        RequireCapabilities(reflection.Capabilities, shader.Capabilities, $"shader[{shader.Id}].reflection.capabilities");
        List<Pipeline> pipelines = manifest.Pipelines.Where(value => value.Stages.Any(stage => stage.Shader == shader.Id)).ToList();
        if (pipelines.Count == 0)
        {
            throw new InvalidOperationException($"Missing pipeline stage for shader: {shader.Id}");
        }
        foreach (Pipeline pipeline in pipelines)
        {
            PipelineStage stage = pipeline.Stages.Single(value => value.Shader == shader.Id);
            RequireReflectedLocations(reflection.Inputs, stage.Inputs, $"shader[{shader.Id}].reflection.inputs");
            RequireReflectedLocations(reflection.Outputs, stage.Outputs, $"shader[{shader.Id}].reflection.outputs");
            List<Descriptor> expectedDescriptors = pipeline.Descriptors
                .Where(value => value.Stages.Contains(shader.Stage, StringComparer.Ordinal))
                .ToList();
            Require(reflection.DescriptorCount == expectedDescriptors.Count, $"shader[{shader.Id}].reflection.descriptorCount", expectedDescriptors.Count.ToString());
            RequireReflectedDescriptors(reflection.Descriptors, expectedDescriptors, $"shader[{shader.Id}].reflection.descriptors");
            bool hasTextInstanceRecord = expectedDescriptors.Any(value =>
                value.Set == manifest.TextInstanceRecord.Set
                && value.Binding == manifest.TextInstanceRecord.Binding
                && value.Stages.SequenceEqual(manifest.TextInstanceRecord.Stages, StringComparer.Ordinal));
            if (hasTextInstanceRecord)
            {
                RequireTextInstanceRecordReflection(reflection, manifest.TextInstanceRecord, shader.Id);
            }
            bool hasPushConstants = pipeline.PushConstants.Stages.Contains(shader.Stage, StringComparer.Ordinal);
            if (!hasPushConstants)
            {
                if (reflection.PushConstant is not null)
                {
                    throw new InvalidOperationException($"Shader has unexpected push constants: {shader.Id}");
                }
                if (pipeline.PushConstants.Size == 0
                    && expectedDescriptors.Any(value => value.Set == manifest.PrimitiveRecord.Set
                        && value.Binding == manifest.PrimitiveRecord.Binding))
                {
                    RequirePrimitiveRecordReflection(reflection, manifest.PrimitiveRecord, shader.Id);
                }
                continue;
            }
            SpirvPushConstant reflected = reflection.PushConstant
                ?? throw new InvalidOperationException($"Shader has no reflected push constants: {shader.Id}");
            PushConstants expected = pipeline.PushConstants;
            Require(reflected.Size == expected.Size, $"shader[{shader.Id}].reflection.pushConstants.size", expected.Size.ToString());
            if (reflected.Members.Count != expected.Members.Count)
            {
                throw new InvalidOperationException($"shader[{shader.Id}].reflection.pushConstants.members count must be {expected.Members.Count}");
            }
            for (int index = 0; index < expected.Members.Count; index++)
            {
                SpirvPushConstantMember actual = reflected.Members[index];
                PushConstantMember member = expected.Members[index];
                Require(actual.Offset == member.Offset, $"shader[{shader.Id}].reflection.pushConstants.members[{index}].offset", member.Offset.ToString());
                Require(actual.Type == member.Type, $"shader[{shader.Id}].reflection.pushConstants.members[{index}].type", member.Type);
            }
        }
    }

    private static void RequirePrimitiveRecordReflection(SpirvModuleReflection reflection, PrimitiveRecord expected, string shaderId)
    {
        SpirvDescriptor actual = reflection.Descriptors.SingleOrDefault(value =>
            value.Set == expected.Set && value.Binding == expected.Binding)
            ?? throw new InvalidOperationException($"Shader has no primitive record descriptor: {shaderId}");
        Require(actual.Type == "storage-buffer", $"shader[{shaderId}].primitiveRecord.type", "storage-buffer");
        Require(actual.StorageStride == expected.Stride, $"shader[{shaderId}].primitiveRecord.stride", expected.Stride.ToString());
        if (actual.StorageMembers.Count != expected.Members.Count)
        {
            throw new InvalidOperationException($"shader[{shaderId}].primitiveRecord.members count must be {expected.Members.Count}");
        }
        for (int index = 0; index < expected.Members.Count; index++)
        {
            SpirvStorageMember actualMember = actual.StorageMembers[index];
            PushConstantMember expectedMember = expected.Members[index];
            Require(actualMember.Offset == expectedMember.Offset,
                $"shader[{shaderId}].primitiveRecord.members[{index}].offset", expectedMember.Offset.ToString());
            Require(actualMember.Type == expectedMember.Type,
                $"shader[{shaderId}].primitiveRecord.members[{index}].type", expectedMember.Type);
        }
    }
    private static void RequireTextInstanceRecordReflection(SpirvModuleReflection reflection, TextInstanceRecord expected, string shaderId)
    {
        SpirvDescriptor actual = reflection.Descriptors.SingleOrDefault(value =>
            value.Set == expected.Set && value.Binding == expected.Binding)
            ?? throw new InvalidOperationException($"Shader has no text instance record descriptor: {shaderId}");
        Require(actual.Type == "storage-buffer", $"shader[{shaderId}].textInstanceRecord.type", "storage-buffer");
        Require(actual.StorageStride == expected.Stride, $"shader[{shaderId}].textInstanceRecord.stride", expected.Stride.ToString());
        if (actual.StorageMembers.Count != expected.Members.Count)
        {
            throw new InvalidOperationException($"shader[{shaderId}].textInstanceRecord.members count must be {expected.Members.Count}");
        }
        for (int index = 0; index < expected.Members.Count; index++)
        {
            SpirvStorageMember actualMember = actual.StorageMembers[index];
            PushConstantMember expectedMember = expected.Members[index];
            Require(actualMember.Offset == expectedMember.Offset,
                $"shader[{shaderId}].textInstanceRecord.members[{index}].offset", expectedMember.Offset.ToString());
            Require(actualMember.Type == expectedMember.Type,
                $"shader[{shaderId}].textInstanceRecord.members[{index}].type", expectedMember.Type);
        }
    }

    private static void RequireReflectedLocations(IReadOnlyList<SpirvInterface> actual, IReadOnlyList<InterfaceLocation> expected, string path)
    {
        if (actual.Select(value => value.Location).Distinct().Count() != actual.Count)
        {
            throw new InvalidOperationException($"{path} contains duplicate locations");
        }
        if (actual.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} count must be {expected.Count}");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            Require(actual[index].Location == expected[index].Location, $"{path}[{index}].location", expected[index].Location.ToString());
            Require(actual[index].Type == expected[index].Type, $"{path}[{index}].type", expected[index].Type);
        }
    }

    private static void RequireReflectedDescriptors(IReadOnlyList<SpirvDescriptor> actual, IReadOnlyList<Descriptor> expected, string path)
    {
        if (actual.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} count must be {expected.Count}");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            SpirvDescriptor actualDescriptor = actual[index];
            Descriptor expectedDescriptor = expected[index];
            Require(actualDescriptor.Set == expectedDescriptor.Set, $"{path}[{index}].set", expectedDescriptor.Set.ToString());
            Require(actualDescriptor.Binding == expectedDescriptor.Binding, $"{path}[{index}].binding", expectedDescriptor.Binding.ToString());
            Require(actualDescriptor.Type == expectedDescriptor.Type, $"{path}[{index}].type", expectedDescriptor.Type);
            Require(actualDescriptor.Count == expectedDescriptor.Count, $"{path}[{index}].count", expectedDescriptor.Count.ToString());
        }
    }

    private static void RequireCapabilities(IReadOnlyList<uint> actual, IReadOnlyList<uint> expected, string path)
    {
        if (actual.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} count must be {expected.Count}");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            Require(actual[index] == expected[index], $"{path}[{index}]", expected[index].ToString());
        }
    }

    private static void RequireSequence(IReadOnlyList<string> actual, IReadOnlyList<string> expected, string path)
    {
        if (actual.Count != expected.Count)
        {
            throw new InvalidOperationException($"{path} count must be {expected.Count}");
        }
        for (int index = 0; index < expected.Count; index++)
        {
            Require(actual[index] == expected[index], $"{path}[{index}]", expected[index]);
        }
    }

    private static void Require(bool condition, string path, string expected)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"Invalid {path}, expected {expected}");
        }
    }

    private static string FindRepositoryRoot()
    {
        string[] starts = { Directory.GetCurrentDirectory(), AppContext.BaseDirectory };
        foreach (string start in starts)
        {
            DirectoryInfo? current = new DirectoryInfo(Path.GetFullPath(start));
            while (current is not null)
            {
                string manifestPath = Path.Combine(current.FullName, ProductionDirectory.Replace('/', Path.DirectorySeparatorChar), ManifestName);
                if (File.Exists(manifestPath))
                {
                    return current.FullName;
                }
                current = current.Parent;
            }
        }
        throw new InvalidOperationException("Could not find the goo-gsharp repository root");
    }

    private static string FindTool(string executable, string sdkEnvironmentVariable)
    {
        string[] names = OperatingSystem.IsWindows() ? new[] { executable, executable + ".exe" } : new[] { executable };
        string? sdk = Environment.GetEnvironmentVariable(sdkEnvironmentVariable);
        if (!string.IsNullOrWhiteSpace(sdk))
        {
            foreach (string bin in new[] { "bin", "Bin" })
            {
                foreach (string name in names)
                {
                    string candidate = Path.Combine(sdk, bin, name);
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
            }
        }

        string? path = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrWhiteSpace(path))
        {
            foreach (string directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
            {
                foreach (string name in names)
                {
                    string candidate = Path.Combine(directory, name);
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
            }
        }
        throw new InvalidOperationException($"Could not find {executable} in {sdkEnvironmentVariable} or PATH");
    }

    private static void RequireCompilerVersion(string compilerPath, Manifest manifest)
    {
        ToolResult result = RunTool(compilerPath, new[] { "-version" });
        RequireSuccess(compilerPath, result);
        string output = (result.StandardOutput + result.StandardError).Trim();
        Require(output == manifest.Toolchain.Compiler.Version, "slangc.version", manifest.Toolchain.Compiler.Version);
    }

    private static void RequireCompatibilityCompilerVersion(string compilerPath, Manifest manifest)
    {
        ToolResult result = RunTool(compilerPath, new[] { "--version" });
        RequireSuccess(compilerPath, result);
        string[] lines = result.StandardOutput.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        Require(lines.Length > 0 && lines[0].Trim() == manifest.Toolchain.CompatibilityCompiler.Version, "glslc.version", manifest.Toolchain.CompatibilityCompiler.Version);
        Require(lines.Any(line => line.Trim() == GlslcVersionMarker + manifest.Toolchain.Sdk), "glslc.sdk", manifest.Toolchain.Sdk);
    }

    private static void RequireValidatorVersion(string validatorPath, Manifest manifest)
    {
        ToolResult result = RunTool(validatorPath, new[] { "--version" });
        RequireSuccess(validatorPath, result);
        string output = result.StandardOutput + result.StandardError;
        Require(output.Contains($"SPIRV-Tools v{manifest.Toolchain.Validator.Version}", StringComparison.Ordinal), "spirv-val.version", manifest.Toolchain.Validator.Version);
        Require(output.Contains($"vulkan-sdk-{manifest.Toolchain.Sdk}", StringComparison.Ordinal), "spirv-val.sdk", manifest.Toolchain.Sdk);
    }

    private static ToolResult RunTool(string path, IEnumerable<string> arguments)
    {
        ProcessStartInfo startInfo = new()
        {
            FileName = path,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (string argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }
        using Process process = Process.Start(startInfo) ?? throw new InvalidOperationException($"Could not start {path}");
        Task<string> outputTask = process.StandardOutput.ReadToEndAsync();
        Task<string> errorTask = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        Task.WaitAll(outputTask, errorTask);
        return new ToolResult(process.ExitCode, outputTask.Result, errorTask.Result);
    }

    private static void RequireSuccess(string path, ToolResult result)
    {
        if (result.ExitCode != 0)
        {
            string details = (result.StandardError + Environment.NewLine + result.StandardOutput).Trim();
            throw new InvalidOperationException($"{path} failed with exit code {result.ExitCode}: {details}");
        }
    }

    private static string ResolveChildPath(string root, string child, string kind)
    {
        string fullPath = Path.GetFullPath(Path.Combine(root, child.Replace('/', Path.DirectorySeparatorChar)));
        string relative = Path.GetRelativePath(root, fullPath);
        if (Path.IsPathRooted(relative) || relative == ".." || relative.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"{kind} path escapes its directory: {child}");
        }
        return fullPath;
    }

    private static string ResolveRepositoryPath(string repositoryRoot, string child, string kind)
    {
        return ResolveChildPath(repositoryRoot, child, kind);
    }

    private static void EnsureLf(string path, ReadOnlySpan<byte> bytes)
    {
        if (bytes.IndexOf((byte)'\r') >= 0)
        {
            throw new InvalidOperationException($"Source must use LF line endings: {path}");
        }
    }

    private static string HashBytes(byte[] bytes)
    {
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
