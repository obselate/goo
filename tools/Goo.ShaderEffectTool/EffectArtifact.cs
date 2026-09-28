using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

internal sealed class EffectArtifact
{
    [JsonPropertyName("schema")]
    public int Schema { get; init; } = 2;

    [JsonPropertyName("abi")]
    public string Abi { get; init; } = EffectAbi.Id;

    [JsonPropertyName("sourceIndependent")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool SourceIndependent { get; init; }

    [JsonPropertyName("artifacts")]
    public IReadOnlyList<EffectBackendArtifact> Artifacts { get; init; } = [];

    [JsonPropertyName("validator")]
    public EffectValidatorIdentity Validator { get; init; } = new();

    [JsonPropertyName("compiler")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public EffectCompilerIdentity? Compiler { get; init; }

    [JsonPropertyName("source")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public EffectSourceIdentity? Source { get; init; }

    public static byte[] Create(
        byte[] spirv,
        SpirvModuleReflection reflection,
        EffectCompilerIdentity? compiler = null,
        EffectSourceIdentity? source = null,
        bool sourceIndependent = false)
    {
        EffectArtifact manifest = new()
        {
            SourceIndependent = sourceIndependent,
            Artifacts =
            [
                new EffectBackendArtifact
                {
                    Binary = new EffectBinary
                    {
                        Sha256 = Convert.ToHexString(SHA256.HashData(spirv)).ToLowerInvariant(),
                        Bytes = spirv.LongLength,
                        Capabilities = reflection.Capabilities
                    }
                }
            ],
            Compiler = compiler,
            Source = source
        };
        return JsonSerializer.SerializeToUtf8Bytes(manifest, JsonOptions)
            .Concat(new byte[] { (byte)'\n' })
            .ToArray();
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };
}

internal sealed class EffectBackendArtifact
{
    [JsonPropertyName("backend")]
    public string Backend { get; init; } = "vulkan";

    [JsonPropertyName("format")]
    public string Format { get; init; } = "spirv";

    [JsonPropertyName("target")]
    public EffectTarget Target { get; init; } = new();

    [JsonPropertyName("binary")]
    public EffectBinary Binary { get; init; } = new();
}

internal sealed class EffectTarget
{
    [JsonPropertyName("vulkan")]
    public string Vulkan { get; init; } = "1.3";

    [JsonPropertyName("spirv")]
    public string Spirv { get; init; } = "1.6";

    [JsonPropertyName("stage")]
    public string Stage { get; init; } = "fragment";

    [JsonPropertyName("entryPoint")]
    public string EntryPoint { get; init; } = "main";
}

internal sealed class EffectBinary
{
    [JsonPropertyName("sha256")]
    public string Sha256 { get; init; } = string.Empty;

    [JsonPropertyName("bytes")]
    public long Bytes { get; init; }

    [JsonPropertyName("capabilities")]
    public IReadOnlyList<uint> Capabilities { get; init; } = Array.Empty<uint>();
}

internal sealed class EffectValidatorIdentity
{
    [JsonPropertyName("project")]
    public string Project { get; init; } = SpirvValidator.Project;

    [JsonPropertyName("version")]
    public string Version { get; init; } = SpirvValidator.Version;

    [JsonPropertyName("commit")]
    public string Commit { get; init; } = SpirvValidator.Commit;

    [JsonPropertyName("sdk")]
    public string Sdk { get; init; } = SpirvValidator.Sdk;
}

internal sealed class EffectCompilerIdentity
{
    [JsonPropertyName("project")]
    public string Project { get; init; } = SlangCompiler.Project;

    [JsonPropertyName("version")]
    public string Version { get; init; } = SlangCompiler.Version;

    [JsonPropertyName("commit")]
    public string Commit { get; init; } = SlangCompiler.Commit;

    [JsonPropertyName("platform")]
    public string Platform { get; init; } = string.Empty;

    [JsonPropertyName("archiveSha256")]
    public string ArchiveSha256 { get; init; } = string.Empty;

    [JsonPropertyName("executableSha256")]
    public string ExecutableSha256 { get; init; } = string.Empty;

    [JsonPropertyName("runtimeSha256")]
    public string RuntimeSha256 { get; init; } = string.Empty;

    [JsonPropertyName("arguments")]
    public IReadOnlyList<string> Arguments { get; init; } = Array.Empty<string>();
}

internal sealed class EffectSourceIdentity
{
    [JsonPropertyName("language")]
    public string Language { get; init; } = string.Empty;

    [JsonPropertyName("sha256")]
    public string Sha256 { get; init; } = string.Empty;

    [JsonPropertyName("authoringSha256")]
    public string AuthoringSha256 { get; init; } = string.Empty;
}
