using System.Security.Cryptography;

internal static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            if ((args.Length == 3 || args.Length == 4) && args[0] == "validate")
            {
                Validate(args[1], args[2], SourceIndependent(args, 3));
                return 0;
            }
            if ((args.Length == 3 || args.Length == 4) && args[0] == "check")
            {
                Check(args[1], args[2], SourceIndependent(args, 3));
                return 0;
            }
            if (args.Length == 2 && args[0] == "selfcheck")
            {
                SelfCheck.Run(args[1], SpirvValidator.Find());
                return 0;
            }
            if ((args.Length == 5 || args.Length == 6) && args[0] == "compile")
            {
                Compile(args[1], args[2], args[3], args[4], SourceIndependent(args, 5));
                return 0;
            }
            if ((args.Length == 3 || args.Length == 4) && args[0] == "compilecheck")
            {
                CompileCheck(args[1], args[2], SourceIndependent(args, 3));
                return 0;
            }
            Console.Error.WriteLine(
                "Usage: Goo.ShaderEffectTool <compile SOURCE AUTHORING_ROOT OUTPUT.goo-effect OUTPUT.json [SOURCE_INDEPENDENT]|compilecheck SOURCE AUTHORING_ROOT [SOURCE_INDEPENDENT]|validate INPUT.spv OUTPUT.json [SOURCE_INDEPENDENT]|check INPUT.spv MANIFEST.json [SOURCE_INDEPENDENT]|selfcheck INPUT.spv>");
            return 2;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    private static bool SourceIndependent(string[] args, int index) =>
        args.Length > index && bool.Parse(args[index].Length == 0 ? "false" : args[index]);

    internal static byte[] ValidateArtifact(
        string input,
        SpirvValidator validator,
        EffectCompilerIdentity? compiler = null,
        EffectSourceIdentity? source = null,
        bool sourceIndependent = false)
    {
        string path = Path.GetFullPath(input);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("ShaderEffect SPIR-V input does not exist", path);
        }
        validator.Validate(path);
        byte[] spirv = File.ReadAllBytes(path);
        SpirvModuleReflection reflection = SpirvReflection.Read(spirv);
        EffectAbi.Validate(reflection, sourceIndependent);
        return EffectArtifact.Create(spirv, reflection, compiler, source, sourceIndependent);
    }

    private static void Compile(
        string input,
        string authoringRoot,
        string outputProgram,
        string outputManifest,
        bool sourceIndependent = false)
    {
        string sourcePath = Path.GetFullPath(input);
        string includePath = Path.GetFullPath(authoringRoot);
        if (!File.Exists(sourcePath))
        {
            throw new FileNotFoundException("ShaderEffect source does not exist", sourcePath);
        }
        if (!Directory.Exists(includePath))
        {
            throw new DirectoryNotFoundException(
                $"ShaderEffect authoring root does not exist: {includePath}");
        }
        string language = SourceLanguage(sourcePath);
        string authoringName = language == "glsl" ? "goo_effect.glsl" : "goo_effect.slang";
        string authoringModule = Path.Combine(includePath, authoringName);
        if (!File.Exists(authoringModule))
        {
            throw new FileNotFoundException("Goo authoring module is missing", authoringModule);
        }
        SlangCompiler compiler = SlangCompiler.Find();
        SpirvValidator validator = SpirvValidator.Find();
        string temporary = Path.Combine(Path.GetTempPath(),
            $"goo-shader-effect-{Guid.NewGuid():N}.spv");
        try
        {
            IReadOnlyList<string> arguments = compiler.Compile(
                language, sourcePath, includePath, temporary, sourceIndependent);
            EffectCompilerIdentity compilerIdentity = new()
            {
                Platform = compiler.Platform,
                ArchiveSha256 = compiler.ArchiveSha256,
                ExecutableSha256 = compiler.ExecutableSha256,
                RuntimeSha256 = compiler.RuntimeSha256,
                Arguments = arguments
            };
            EffectSourceIdentity source = new()
            {
                Language = language,
                Sha256 = HashFile(sourcePath),
                AuthoringSha256 = HashFile(authoringModule)
            };
            byte[] manifest = ValidateArtifact(temporary, validator, compilerIdentity, source,
                sourceIndependent);
            WriteAtomic(outputProgram, EffectProgramBundle.Create(File.ReadAllBytes(temporary),
                sourceIndependent));
            WriteAtomic(outputManifest, manifest);
            Console.WriteLine($"Compiled {input} as {EffectAbi.Id}");
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }

    private static void CompileCheck(string input, string authoringRoot, bool sourceIndependent)
    {
        string directory = Path.Combine(Path.GetTempPath(),
            $"goo-shader-effect-compilecheck-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        string firstProgram = Path.Combine(directory, "first.goo-effect");
        string firstManifest = Path.Combine(directory, "first.json");
        string secondProgram = Path.Combine(directory, "second.goo-effect");
        string secondManifest = Path.Combine(directory, "second.json");
        string firstSpirv = Path.Combine(directory, "first.spv");
        try
        {
            Compile(input, authoringRoot, firstProgram, firstManifest, sourceIndependent);
            Compile(input, authoringRoot, secondProgram, secondManifest, sourceIndependent);
            RequireEqual(firstProgram, secondProgram);
            RequireEqual(firstManifest, secondManifest);
            File.WriteAllBytes(firstSpirv,
                EffectProgramBundle.ReadVulkanSpirv(File.ReadAllBytes(firstProgram)));
            if (!sourceIndependent)
            {
                SelfCheck.Run(firstSpirv, SpirvValidator.Find());
            }
        }
        finally
        {
            Directory.Delete(directory, true);
        }
        Console.WriteLine($"Compile check passed for {input}");
    }

    private static void Validate(string input, string output, bool sourceIndependent)
    {
        byte[] manifest = ValidateArtifact(input, SpirvValidator.Find(),
            sourceIndependent: sourceIndependent);
        WriteAtomic(output, manifest);
        Console.WriteLine($"Validated {input} as {EffectAbi.Id}");
    }

    private static void Check(string input, string manifestPath, bool sourceIndependent)
    {
        byte[] expected = ValidateArtifact(input, SpirvValidator.Find(),
            sourceIndependent: sourceIndependent);
        byte[] actual = File.ReadAllBytes(manifestPath);
        if (!actual.AsSpan().SequenceEqual(expected))
        {
            throw new InvalidOperationException($"ShaderEffect manifest differs: {manifestPath}");
        }
        Console.WriteLine($"Checked {input} against {manifestPath}");
    }

    private static string SourceLanguage(string input)
    {
        string extension = Path.GetExtension(input).ToLowerInvariant();
        if (extension == ".slang")
        {
            return "slang";
        }
        if (extension == ".glsl")
        {
            return "glsl";
        }
        throw new InvalidOperationException("ShaderEffect source extension must be .slang or .glsl");
    }

    private static void RequireEqual(string first, string second)
    {
        if (!File.ReadAllBytes(first).AsSpan().SequenceEqual(File.ReadAllBytes(second)))
        {
            throw new InvalidOperationException(
                $"ShaderEffect compile output is not deterministic: {Path.GetFileName(first)}");
        }
    }

    private static string HashFile(string path)
    {
        using FileStream stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static void WriteAtomic(string output, byte[] bytes)
    {
        string path = Path.GetFullPath(output);
        string directory = Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("ShaderEffect manifest has no parent directory");
        Directory.CreateDirectory(directory);
        string temporary = Path.Combine(directory,
            $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");
        try
        {
            File.WriteAllBytes(temporary, bytes);
            File.Move(temporary, path, true);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }
}
