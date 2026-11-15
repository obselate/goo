using System;

namespace Facebook.Yoga
{
    public struct YGValue : IEquatable<YGValue>
    {
        public float Value;
        public Unit Unit;

        public YGValue(float value, Unit unit)
        {
            Value = value;
            Unit = unit;
        }

        public bool Equals(YGValue other)
        {
            if (Unit != other.Unit)
                return false;

            return Unit switch
            {
                Unit.Undefined or Unit.Auto or Unit.FitContent or Unit.MaxContent or Unit.Stretch => true,
                Unit.Point or Unit.Percent => Value == other.Value,
                _ => false,
            };
        }

        public override bool Equals(object? obj) => obj is YGValue other && Equals(other);

        public override int GetHashCode()
        {
            return Unit switch
            {
                Unit.Undefined or Unit.Auto or Unit.FitContent or Unit.MaxContent or Unit.Stretch
                    => HashCode.Combine(Unit),
                _ => HashCode.Combine(Value, Unit),
            };
        }

        public static bool operator ==(YGValue lhs, YGValue rhs) => lhs.Equals(rhs);
        public static bool operator !=(YGValue lhs, YGValue rhs) => !lhs.Equals(rhs);

        public static YGValue operator -(YGValue value) => new(-value.Value, value.Unit);
    }

    public class StyleLength : IEquatable<StyleLength>
    {
        private static readonly StyleLength UndefinedValue = new StyleLength(FloatOptional.Undefined, Unit.Undefined);
        private static readonly StyleLength AutoValue = new StyleLength(FloatOptional.Undefined, Unit.Auto);

        public static StyleLength Undefined() => UndefinedValue;

        public static StyleLength OfAuto() => AutoValue;

        public static StyleLength Points(float value)
        {
            return IsUndefined(value) || float.IsInfinity(value)
                ? Undefined()
                : new StyleLength(new FloatOptional(value), Unit.Point);
        }

        public static StyleLength Percent(float value)
        {
            return IsUndefined(value) || float.IsInfinity(value)
                ? Undefined()
                : new StyleLength(new FloatOptional(value), Unit.Percent);
        }

        public static StyleLength Mixed(float pixels, float percent) =>
            pixels == 0 ? new StyleLength(new FloatOptional(percent), Unit.Percent) : new MixedStyleLength(pixels, percent);

        public float Offset => this is MixedStyleLength mixed ? mixed.Pixels : 0;
        public bool IsMixed => this is MixedStyleLength;
        public bool IsAuto() => _unit == Unit.Auto;

        public bool IsUndefined() => _unit == Unit.Undefined;

        public bool IsPoints() => _unit == Unit.Point;

        public bool IsPercent() => _unit == Unit.Percent;

        public bool IsDefined() => !IsUndefined();

        public FloatOptional Value() => _value;

        public FloatOptional Resolve(float referenceLength)
        {
            switch (_unit)
            {
                case Unit.Point:
                    return _value;
                case Unit.Percent:
                    return new FloatOptional(Offset + _value.Unwrap() * referenceLength * 0.01f);
                default:
                    return FloatOptional.Undefined;
            }
        }

        public static explicit operator YGValue(StyleLength length)
        {
            return new YGValue(length._value.Unwrap(), length._unit);
        }

        public override bool Equals(object? obj)
        {
            return obj is StyleLength other && Equals(other);
        }

        public bool Equals(StyleLength? other)
        {
            if (other is null) return false;
            return _value.Equals(other._value) && _unit == other._unit && Offset == other.Offset;
        }

        public override int GetHashCode()
        {
            return HashCode.Combine(_value, _unit, Offset);
        }

        public static bool operator ==(StyleLength? left, StyleLength? right)
        {
            if (left is null) return right is null;
            return left.Equals(right);
        }

        public static bool operator !=(StyleLength? left, StyleLength? right)
        {
            return !(left == right);
        }

        public bool InexactEquals(StyleLength other)
        {
            return _unit == other._unit && Offset == other.Offset &&
                InexactEquals(_value, other._value);
        }

        private StyleLength(FloatOptional value, Unit unit)
        {
            _value = value;
            _unit = unit;
        }

        private readonly FloatOptional _value;
        private readonly Unit _unit = Unit.Undefined;

        private sealed class MixedStyleLength : StyleLength
        {
            internal readonly float Pixels;

            internal MixedStyleLength(float pixels, float percent)
                : base(new FloatOptional(percent), Unit.Percent)
            {
                Pixels = pixels;
            }
        }

        private static bool IsUndefined(float value)
        {
            return float.IsNaN(value);
        }

        private static bool InexactEquals(FloatOptional a, FloatOptional b)
        {
            return FloatOptional.InexactEquals(a, b);
        }
    }

    internal static class StyleLengthExtensions
    {
        public static bool InexactEquals(this StyleLength a, StyleLength b)
        {
            return a.InexactEquals(b);
        }
    }
}
