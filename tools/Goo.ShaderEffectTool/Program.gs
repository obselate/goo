import System
import System.IO
import System.Security.Cryptography

internal shared class Program {
    func Main(args[]string) int32 {
        try {
            if (args.Length == 3 || args.Length == 4) && args[0] == "validate" {
                Validate(args[1], args[2], SourceIndependent(args, 3))
                return 0
            }
            if (args.Length == 3 || args.Length == 4) && args[0] == "check" {
                Check(args[1], args[2], SourceIndependent(args, 3))
                return 0
            }
            if args.Length == 2 && args[0] == "selfcheck" {
                SelfCheck.Run(args[1], SpirvValidator.Find())
                return 0
            }
            if (args.Length == 5 || args.Length == 6) && args[0] == "compile" {
                Compile(args[1], args[2], args[3], args[4], SourceIndependent(args, 5))
                return 0
            }
            if (args.Length == 3 || args.Length == 4) && args[0] == "compilecheck" {
                CompileCheck(args[1], args[2], SourceIndependent(args, 3))
                return 0
            }
            Console.Error.WriteLine(
                "Usage: Goo.ShaderEffectTool <compile SOURCE AUTHORING_ROOT OUTPUT.goo-effect OUTPUT.json [SOURCE_INDEPENDENT]|compilecheck SOURCE AUTHORING_ROOT [SOURCE_INDEPENDENT]|validate INPUT.spv OUTPUT.json [SOURCE_INDEPENDENT]|check INPUT.spv MANIFEST.json [SOURCE_INDEPENDENT]|selfcheck INPUT.spv>"
            )
            return 2
        } catch (error Exception) {
            Console.Error.WriteLine(error.Message)
            return 1
        }
    }

    private func SourceIndependent(args[]string, index int32) bool -> args.Length > index && bool.Parse(
        if args[index].Length == 0 {
            "false"
        } else {
            args[index]
        }
    )

    internal func ValidateArtifact(
        input string,
        validator SpirvValidator,
        compiler EffectCompilerIdentity? = nil,
        source EffectSourceIdentity? = nil,
        sourceIndependent bool = false
    )[]uint8 {
        let path = Path.GetFullPath(input)
        if !File.Exists(path) {
            throw FileNotFoundException("ShaderEffect SPIR-V input does not exist", path)
        }
        validator.Validate(path)
        let spirv = File.ReadAllBytes(path)
        let reflection = SpirvReflection.Read(spirv, true)
        EffectAbi.Validate(reflection, sourceIndependent)
        return EffectArtifact.Create(spirv, reflection, compiler, source, sourceIndependent)
    }

    private func Compile(
        input string,
        authoringRoot string,
        outputProgram string,
        outputManifest string,
        sourceIndependent bool = false
    ) {
        let sourcePath = Path.GetFullPath(input)
        let includePath = Path.GetFullPath(authoringRoot)
        if !File.Exists(sourcePath) {
            throw FileNotFoundException("ShaderEffect source does not exist", sourcePath)
        }
        if !Directory.Exists(includePath) {
            throw DirectoryNotFoundException("ShaderEffect authoring root does not exist: $includePath")
        }
        let language = SourceLanguage(sourcePath)
        let authoringName = if language == "glsl" {
            "goo_effect.glsl"
        } else {
            "goo_effect.slang"
        }
        let authoringModule = Path.Combine(includePath, authoringName)
        if !File.Exists(authoringModule) {
            throw FileNotFoundException("Goo authoring module is missing", authoringModule)
        }
        let compiler = SlangCompiler.Find()
        let validator = SpirvValidator.Find()
        let temporary = Path.Combine(Path.GetTempPath(), "goo-shader-effect-${Guid.NewGuid():N}.spv")
        try {
            let arguments = compiler.Compile(language, sourcePath, includePath, temporary, sourceIndependent)
            let compilerIdentity = EffectCompilerIdentity{
                Platform: compiler.Platform,
                ArchiveSha256: compiler.ArchiveSha256,
                ExecutableSha256: compiler.ExecutableSha256,
                RuntimeSha256: compiler.RuntimeSha256,
                Arguments: arguments
            }
            let source = EffectSourceIdentity{
                Language: language,
                Sha256: HashFile(sourcePath),
                AuthoringSha256: HashFile(authoringModule)
            }
            let manifest = ValidateArtifact(temporary, validator, compilerIdentity, source, sourceIndependent)
            WriteAtomic(outputProgram, EffectProgramBundle.Create(File.ReadAllBytes(temporary), sourceIndependent))
            WriteAtomic(outputManifest, manifest)
            Console.WriteLine("Compiled $input as ${EffectAbi.Id}")
        } finally {
            if File.Exists(temporary) {
                File.Delete(temporary)
            }
        }
    }

    private func CompileCheck(input string, authoringRoot string, sourceIndependent bool) {
        let directory = Path.Combine(Path.GetTempPath(), "goo-shader-effect-compilecheck-${Guid.NewGuid():N}")
        Directory.CreateDirectory(directory)
        let firstProgram = Path.Combine(directory, "first.goo-effect")
        let firstManifest = Path.Combine(directory, "first.json")
        let secondProgram = Path.Combine(directory, "second.goo-effect")
        let secondManifest = Path.Combine(directory, "second.json")
        let firstSpirv = Path.Combine(directory, "first.spv")
        try {
            Compile(input, authoringRoot, firstProgram, firstManifest, sourceIndependent)
            Compile(input, authoringRoot, secondProgram, secondManifest, sourceIndependent)
            RequireEqual(firstProgram, secondProgram)
            RequireEqual(firstManifest, secondManifest)
            File.WriteAllBytes(firstSpirv, EffectProgramBundle.ReadVulkanSpirv(File.ReadAllBytes(firstProgram)))
            if !sourceIndependent {
                SelfCheck.Run(firstSpirv, SpirvValidator.Find())
            }
        } finally {
            Directory.Delete(directory, true)
        }
        Console.WriteLine("Compile check passed for $input")
    }

    private func Validate(input string, output string, sourceIndependent bool) {
        let manifest = ValidateArtifact(input, SpirvValidator.Find(), sourceIndependent: sourceIndependent)
        WriteAtomic(output, manifest)
        Console.WriteLine("Validated $input as ${EffectAbi.Id}")
    }

    private func Check(input string, manifestPath string, sourceIndependent bool) {
        let expected = ValidateArtifact(input, SpirvValidator.Find(), sourceIndependent: sourceIndependent)
        let actual = File.ReadAllBytes(manifestPath)
        if !actual.AsSpan().SequenceEqual(expected) {
            throw InvalidOperationException("ShaderEffect manifest differs: $manifestPath")
        }
        Console.WriteLine("Checked $input against $manifestPath")
    }

    private func SourceLanguage(input string) string {
        let extension = Path.GetExtension(input).ToLowerInvariant()
        if extension == ".slang" {
            return "slang"
        }
        if extension == ".glsl" {
            return "glsl"
        }
        throw InvalidOperationException("ShaderEffect source extension must be .slang or .glsl")
    }

    private func RequireEqual(first string, second string) {
        if !File.ReadAllBytes(first).AsSpan().SequenceEqual(File.ReadAllBytes(second)) {
            throw InvalidOperationException(
                "ShaderEffect compile output is not deterministic: ${Path.GetFileName(first)}"
            )
        }
    }

    private func HashFile(path string) string {
        using let stream = File.OpenRead(path)
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant()
    }

    private func WriteAtomic(output string, bytes[]uint8) {
        let path = Path.GetFullPath(output)
        let directory = Path.GetDirectoryName(path) ??
            throw InvalidOperationException("ShaderEffect manifest has no parent directory")
        Directory.CreateDirectory(directory)
        let temporary = Path.Combine(directory, ".${Path.GetFileName(path)}.${Guid.NewGuid():N}.tmp")
        try {
            File.WriteAllBytes(temporary, bytes)
            File.Move(temporary, path, true)
        } finally {
            if File.Exists(temporary) {
                File.Delete(temporary)
            }
        }
    }
}
