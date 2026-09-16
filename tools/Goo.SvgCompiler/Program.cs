using System.Globalization;
using System.Security.Cryptography;

namespace Goo.SvgCompiler;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0 || args is ["--help"] or ["-h"])
            {
                Console.Error.WriteLine("usage: Goo.SvgCompiler <input.svg> <output.gcv1>");
                Console.Error.WriteLine("       Goo.SvgCompiler --check <input.svg>");
                Console.Error.WriteLine("       Goo.SvgCompiler --goo-check <Goo.dll> <input.svg>");
                return args.Length == 0 ? 2 : 0;
            }

            if (args is ["--check", var checkInput])
            {
                var bytes = CompileDeterministic(checkInput, out var hash);
                Console.WriteLine(string.Create(
                    CultureInfo.InvariantCulture,
                    $"gcv1 bytes={bytes.Length} sha256={hash}"));
                return 0;
            }

            if (args is ["--goo-check", var gooAssembly, var gooInput])
            {
                var bytes = CompileDeterministic(gooInput, out var hash);
                var asset = GooRuntimeGate.Read(gooAssembly, bytes);
                Console.WriteLine(string.Create(
                    CultureInfo.InvariantCulture,
                    $"goo-asset bytes={asset.ByteCount} nodes={asset.Nodes} contours={asset.Contours} curves={asset.Curves} paints={asset.Paints} strokes={asset.Strokes} clips={asset.Clips} tracks={asset.Tracks} keyframes={asset.Keyframes} morphCurves={asset.MorphCurves} sha256={hash}"));
                return 0;
            }

            if (args.Length != 2)
            {
                Console.Error.WriteLine("usage: Goo.SvgCompiler <input.svg> <output.gcv1>");
                return 2;
            }

            var output = SvgCompiler.CompileFile(args[0]);
            var directory = Path.GetDirectoryName(Path.GetFullPath(args[1]));
            if (directory is not null)
            {
                Directory.CreateDirectory(directory);
            }
            File.WriteAllBytes(args[1], output);
            Console.WriteLine(string.Create(
                CultureInfo.InvariantCulture,
                $"gcv1 bytes={output.Length}"));
            return 0;
        }
        catch (SvgCompileException exception)
        {
            Console.Error.WriteLine($"SVG compile failed: {exception.Message}");
            return 1;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"SVG compile failed: {exception.Message}");
            return 1;
        }
    }

    private static byte[] CompileDeterministic(string input, out string hash)
    {
        var bytes = SvgCompiler.CompileFile(input);
        var repeat = SvgCompiler.CompileFile(input);
        if (!bytes.AsSpan().SequenceEqual(repeat))
        {
            throw new SvgCompileException("repeated compilation produced different GCV1 bytes");
        }
        hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        return bytes;
    }
}
