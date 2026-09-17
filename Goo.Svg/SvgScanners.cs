namespace Goo.Svg;

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
            throw SvgParser.Fail(owner, $"{field} contains an invalid number");
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
                throw SvgParser.Fail(owner, $"{field} contains an invalid exponent");
            }
        }
        if (!double.TryParse(text[start..index], NumberStyles.Float, CultureInfo.InvariantCulture, out value)
            || !double.IsFinite(value))
        {
            throw SvgParser.Fail(owner, $"{field} contains a non-finite number");
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
            throw SvgParser.Fail(owner, "invalid transform list");
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
                throw SvgParser.Fail(owner, "unterminated transform");
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
            throw SvgParser.Fail(owner, "invalid transform number");
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
                throw SvgParser.Fail(owner, "invalid transform exponent");
            }
        }
        if (!double.TryParse(text[start..index], NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            || !double.IsFinite(value))
        {
            throw SvgParser.Fail(owner, "transform contains a non-finite number");
        }
        return value;
    }

    internal void RequireEnd()
    {
        SkipSeparators();
        if (index != text.Length)
        {
            throw SvgParser.Fail(owner, "invalid transform list");
        }
    }

    private void SkipSeparators()
    {
        while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
    }
}
