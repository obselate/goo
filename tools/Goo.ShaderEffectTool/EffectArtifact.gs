import System
import System.Collections.Generic
import System.Linq
import System.Security.Cryptography
import System.Text.Json
import System.Text.Json.Serialization

internal class EffectArtifact {
    init() {
        Schema = 2
        Abi = EffectAbi.Id
        Artifacts = []EffectBackendArtifact{}
        Validator = EffectValidatorIdentity()
    }

    @JsonPropertyName("schema")
    prop Schema int32 {
        get;
        init;
    }

    @JsonPropertyName("abi")
    prop Abi string {
        get;
        init;
    }

    @JsonPropertyName("sourceIndependent")
    @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)
    prop SourceIndependent bool {
        get;
        init;
    }

    @JsonPropertyName("artifacts")
    prop Artifacts IReadOnlyList[EffectBackendArtifact] {
        get;
        init;
    }

    @JsonPropertyName("validator")
    prop Validator EffectValidatorIdentity {
        get;
        init;
    }

    @JsonPropertyName("compiler")
    @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    prop Compiler EffectCompilerIdentity? {
        get;
        init;
    }

    @JsonPropertyName("source")
    @JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    prop Source EffectSourceIdentity? {
        get;
        init;
    }

    shared {
        func Create(
            spirv[]uint8,
            reflection SpirvModuleReflection,
            compiler EffectCompilerIdentity? = nil,
            source EffectSourceIdentity? = nil,
            sourceIndependent bool = false
        )[]uint8 {
            let manifest = EffectArtifact{
                SourceIndependent: sourceIndependent,
                Artifacts: []EffectBackendArtifact{
                    EffectBackendArtifact{
                        Binary: EffectBinary{
                            Sha256: Convert.ToHexString(SHA256.HashData(spirv)).ToLowerInvariant(),
                            Bytes: spirv.LongLength,
                            Capabilities: reflection.Capabilities
                        }
                    }
                },
                Compiler: compiler,
                Source: source
            }
            return JsonSerializer.SerializeToUtf8Bytes(manifest, JsonOptions).Concat([]uint8{uint8('\n')}).ToArray()
        }

        private let JsonOptions JsonSerializerOptions = JsonSerializerOptions{WriteIndented: true}
    }
}

internal class EffectBackendArtifact {
    init() {
        Backend = "vulkan"
        Format = "spirv"
        Target = EffectTarget()
        Binary = EffectBinary()
    }

    @JsonPropertyName("backend")
    prop Backend string {
        get;
        init;
    }

    @JsonPropertyName("format")
    prop Format string {
        get;
        init;
    }

    @JsonPropertyName("target")
    prop Target EffectTarget {
        get;
        init;
    }

    @JsonPropertyName("binary")
    prop Binary EffectBinary {
        get;
        init;
    }
}

internal class EffectTarget {
    init() {
        Vulkan = "1.3"
        Spirv = "1.6"
        Stage = "fragment"
        EntryPoint = "main"
    }

    @JsonPropertyName("vulkan")
    prop Vulkan string {
        get;
        init;
    }

    @JsonPropertyName("spirv")
    prop Spirv string {
        get;
        init;
    }

    @JsonPropertyName("stage")
    prop Stage string {
        get;
        init;
    }

    @JsonPropertyName("entryPoint")
    prop EntryPoint string {
        get;
        init;
    }
}

internal class EffectBinary {
    init() {
        Sha256 = string.Empty
        Capabilities = Array.Empty[uint32]()
    }

    @JsonPropertyName("sha256")
    prop Sha256 string {
        get;
        init;
    }

    @JsonPropertyName("bytes")
    prop Bytes int64 {
        get;
        init;
    }

    @JsonPropertyName("capabilities")
    prop Capabilities IReadOnlyList[uint32] {
        get;
        init;
    }
}

internal class EffectValidatorIdentity {
    init() {
        Project = SpirvValidator.Project
        Version = SpirvValidator.Version
        Commit = SpirvValidator.Commit
        Sdk = SpirvValidator.Sdk
    }

    @JsonPropertyName("project")
    prop Project string {
        get;
        init;
    }

    @JsonPropertyName("version")
    prop Version string {
        get;
        init;
    }

    @JsonPropertyName("commit")
    prop Commit string {
        get;
        init;
    }

    @JsonPropertyName("sdk")
    prop Sdk string {
        get;
        init;
    }
}

internal class EffectCompilerIdentity {
    init() {
        Project = SlangCompiler.Project
        Version = SlangCompiler.Version
        Commit = SlangCompiler.Commit
        Platform = string.Empty
        ArchiveSha256 = string.Empty
        ExecutableSha256 = string.Empty
        RuntimeSha256 = string.Empty
        Arguments = Array.Empty[string]()
    }

    @JsonPropertyName("project")
    prop Project string {
        get;
        init;
    }

    @JsonPropertyName("version")
    prop Version string {
        get;
        init;
    }

    @JsonPropertyName("commit")
    prop Commit string {
        get;
        init;
    }

    @JsonPropertyName("platform")
    prop Platform string {
        get;
        init;
    }

    @JsonPropertyName("archiveSha256")
    prop ArchiveSha256 string {
        get;
        init;
    }

    @JsonPropertyName("executableSha256")
    prop ExecutableSha256 string {
        get;
        init;
    }

    @JsonPropertyName("runtimeSha256")
    prop RuntimeSha256 string {
        get;
        init;
    }

    @JsonPropertyName("arguments")
    prop Arguments IReadOnlyList[string] {
        get;
        init;
    }
}

internal class EffectSourceIdentity {
    init() {
        Language = string.Empty
        Sha256 = string.Empty
        AuthoringSha256 = string.Empty
    }

    @JsonPropertyName("language")
    prop Language string {
        get;
        init;
    }

    @JsonPropertyName("sha256")
    prop Sha256 string {
        get;
        init;
    }

    @JsonPropertyName("authoringSha256")
    prop AuthoringSha256 string {
        get;
        init;
    }
}
