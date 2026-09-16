namespace Goo.SvgCompiler;

internal sealed class SvgNumberScanner
{
    private readonly string text;
    private readonly XElement owner;
    private readonly string field;
    private int index;

    internal SvgNumberScanner(string text, XElement owner, string field)
    {
        this.text = text;
        this.owner = owner;
        this.field = field;
    }

    internal bool TryRead(out double value)
    {
        SkipSeparators();
        if (index >= text.Length)
        {
            value = 0;
            return false;
        }
        var start = index;
        if (text[index] is '+' or '-') index++;
        var digits = 0;
        while (index < text.Length && char.IsDigit(text[index]))
        {
            index++;
            digits++;
        }
        if (index < text.Length && text[index] == '.')
        {
            index++;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                digits++;
            }
        }
        if (digits == 0)
        {
            throw SvgCompiler.Fail(owner, $"{field} contains an invalid number");
        }
        if (index < text.Length && text[index] is 'e' or 'E')
        {
            index++;
            if (index < text.Length && text[index] is '+' or '-') index++;
            var exponentDigits = 0;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                exponentDigits++;
            }
            if (exponentDigits == 0)
            {
                throw SvgCompiler.Fail(owner, $"{field} contains an invalid exponent");
            }
        }
        if (!double.TryParse(text[start..index], NumberStyles.Float, CultureInfo.InvariantCulture, out value)
            || !double.IsFinite(value))
        {
            throw SvgCompiler.Fail(owner, $"{field} contains a non-finite number");
        }
        return true;
    }

    private void SkipSeparators()
    {
        while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
    }
}

internal sealed class SvgTransformScanner
{
    private readonly string text;
    private readonly XElement owner;
    private int index;

    internal SvgTransformScanner(string text, XElement owner)
    {
        this.text = text;
        this.owner = owner;
    }

    internal bool TryReadName(out string name)
    {
        SkipSeparators();
        if (index >= text.Length)
        {
            name = "";
            return false;
        }
        var start = index;
        while (index < text.Length && char.IsLetter(text[index])) index++;
        if (start == index || index >= text.Length || text[index] != '(')
        {
            throw SvgCompiler.Fail(owner, "invalid transform list");
        }
        name = text[start..index].ToLowerInvariant();
        index++;
        return true;
    }

    internal List<double> ReadArguments()
    {
        var values = new List<double>();
        while (true)
        {
            while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
            if (index >= text.Length)
            {
                throw SvgCompiler.Fail(owner, "unterminated transform");
            }
            if (text[index] == ')')
            {
                index++;
                return values;
            }
            values.Add(ReadNumber());
        }
    }

    private double ReadNumber()
    {
        var start = index;
        if (index < text.Length && text[index] is '+' or '-') index++;
        var digits = 0;
        while (index < text.Length && char.IsDigit(text[index]))
        {
            index++;
            digits++;
        }
        if (index < text.Length && text[index] == '.')
        {
            index++;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                digits++;
            }
        }
        if (digits == 0)
        {
            throw SvgCompiler.Fail(owner, "invalid transform number");
        }
        if (index < text.Length && text[index] is 'e' or 'E')
        {
            index++;
            if (index < text.Length && text[index] is '+' or '-') index++;
            var exponentDigits = 0;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                exponentDigits++;
            }
            if (exponentDigits == 0)
            {
                throw SvgCompiler.Fail(owner, "invalid transform exponent");
            }
        }
        if (!double.TryParse(text[start..index], NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            || !double.IsFinite(value))
        {
            throw SvgCompiler.Fail(owner, "transform contains a non-finite number");
        }
        return value;
    }

    internal void RequireEnd()
    {
        SkipSeparators();
        if (index != text.Length)
        {
            throw SvgCompiler.Fail(owner, "invalid transform list");
        }
    }

    private void SkipSeparators()
    {
        while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
    }
}

internal sealed class ByteWriter
{
    private readonly List<byte> bytes = [];
    internal int Count => bytes.Count;

    internal void WriteU16(ushort value)
    {
        bytes.Add((byte)value);
        bytes.Add((byte)(value >> 8));
    }

    internal void WriteU32(uint value)
    {
        bytes.Add((byte)value);
        bytes.Add((byte)(value >> 8));
        bytes.Add((byte)(value >> 16));
        bytes.Add((byte)(value >> 24));
    }

    internal void WriteF32(double value)
    {
        if (!double.IsFinite(value) || value < float.MinValue || value > float.MaxValue)
        {
            throw new SvgCompileException("compiled value is not a finite float32");
        }
        WriteU32((uint)BitConverter.SingleToInt32Bits((float)value));
    }

    internal void WriteBytes(byte[] value) => bytes.AddRange(value);
    internal void WriteZeros(int count)
    {
        for (var index = 0; index < count; index++) bytes.Add(0);
    }

    internal void Align4()
    {
        while ((bytes.Count & 3) != 0) bytes.Add(0);
    }

    internal byte[] ToArray() => bytes.ToArray();

    internal void WriteU16At(int offset, ushort value)
    {
        bytes[offset] = (byte)value;
        bytes[offset + 1] = (byte)(value >> 8);
    }

    internal void WriteU32At(int offset, uint value)
    {
        bytes[offset] = (byte)value;
        bytes[offset + 1] = (byte)(value >> 8);
        bytes[offset + 2] = (byte)(value >> 16);
        bytes[offset + 3] = (byte)(value >> 24);
    }

    internal void WriteF32At(int offset, double value)
    {
        if (!double.IsFinite(value) || value < float.MinValue || value > float.MaxValue)
        {
            throw new SvgCompileException("compiled value is not a finite float32");
        }
        WriteU32At(offset, (uint)BitConverter.SingleToInt32Bits((float)value));
    }
}
