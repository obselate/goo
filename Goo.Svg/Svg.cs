using Goo;
namespace Goo.Svg;

public sealed class SvgParseException : FormatException
{
    public SvgParseException(string message, Exception? innerException = null)
        : base(message, innerException)
    {
    }
}

public static class Svg
{
    public static VectorAsset Parse(string source)
    {
        ArgumentNullException.ThrowIfNull(source);
        return SvgParser.ParseText(source);
    }

    public static VectorAsset Load(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        return SvgParser.LoadStream(stream, "<stream>");
    }

    public static VectorAsset Load(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        return SvgParser.LoadFile(path);
    }
}
