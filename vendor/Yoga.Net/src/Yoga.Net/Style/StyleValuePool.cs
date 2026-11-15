using System;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Threading;

namespace Facebook.Yoga
{
    public class StyleValuePool
    {
        private struct BufferSize : IConstant { public int Value => 43; }
        private const int InlineLengthCacheSize = 1 << 12;
        private static StyleLength?[]? inlineLengthCache_;

        private SmallValueBuffer<BufferSize> buffer_ = new SmallValueBuffer<BufferSize>();
        private ConcurrentDictionary<ushort, StyleLength>? indexedLengthCache_;

        public bool HasPercentageLength => buffer_.HasPercentageLength();

        public void Store(ref StyleValueHandle handle, StyleLength length)
        {
            var oldType = handle.HandleType;
            if (length.IsUndefined())
            {
                InvalidateIndexedLength(handle);
                handle.SetType(StyleValueHandle.HandleTypeEnum.Undefined);
            }
            else if (length.IsAuto())
            {
                InvalidateIndexedLength(handle);
                handle.SetType(StyleValueHandle.HandleTypeEnum.Auto);
            }
            else if (length.IsMixed)
            {
                StoreMixed(ref handle, length.Offset, length.Value().Unwrap());
            }
            else
            {
                var type = length.IsPoints() ? StyleValueHandle.HandleTypeEnum.Point : StyleValueHandle.HandleTypeEnum.Percent;
                StoreValue(ref handle, length.Value().Unwrap(), type);
            }
            UpdatePercentageLengthCount(oldType, handle.HandleType);
        }

        public void Store(ref StyleValueHandle handle, StyleSizeLength sizeValue)
        {
            var oldType = handle.HandleType;
            if (sizeValue.IsUndefined())
            {
                InvalidateIndexedLength(handle);
                handle.SetType(StyleValueHandle.HandleTypeEnum.Undefined);
            }
            else if (sizeValue.IsAuto())
            {
                InvalidateIndexedLength(handle);
                handle.SetType(StyleValueHandle.HandleTypeEnum.Auto);
            }
            else if (sizeValue.IsMaxContent())
            {
                StoreKeyword(ref handle, StyleValueHandle.KeywordEnum.MaxContent);
            }
            else if (sizeValue.IsStretch())
            {
                StoreKeyword(ref handle, StyleValueHandle.KeywordEnum.Stretch);
            }
            else if (sizeValue.IsFitContent())
            {
                StoreKeyword(ref handle, StyleValueHandle.KeywordEnum.FitContent);
            }
            else if (sizeValue.IsMixed)
            {
                StoreMixed(ref handle, sizeValue.Offset, sizeValue.Value().Unwrap());
            }
            else
            {
                var type = sizeValue.IsPoints() ? StyleValueHandle.HandleTypeEnum.Point : StyleValueHandle.HandleTypeEnum.Percent;
                StoreValue(ref handle, sizeValue.Value().Unwrap(), type);
            }
            UpdatePercentageLengthCount(oldType, handle.HandleType);
        }

        public void Store(ref StyleValueHandle handle, FloatOptional number)
        {
            var oldType = handle.HandleType;
            if (number.IsUndefined())
            {
                InvalidateIndexedLength(handle);
                handle.SetType(StyleValueHandle.HandleTypeEnum.Undefined);
            }
            else
            {
                StoreValue(ref handle, number.Unwrap(), StyleValueHandle.HandleTypeEnum.Number);
            }
            UpdatePercentageLengthCount(oldType, handle.HandleType);
        }

        public StyleLength GetLength(StyleValueHandle handle)
        {
            if (handle.IsUndefined)
            {
                return StyleLength.Undefined();
            }
            else if (handle.IsAuto)
            {
                return StyleLength.OfAuto();
            }
            else
            {
                System.Diagnostics.Debug.Assert(
                    handle.HandleType == StyleValueHandle.HandleTypeEnum.Point ||
                    handle.HandleType == StyleValueHandle.HandleTypeEnum.Percent ||
                    handle.HandleType == StyleValueHandle.HandleTypeEnum.Mixed);

                return handle.IsValueIndexed()
                    ? GetIndexedLength(handle)
                    : GetInlineLength(handle);
            }
        }

        public StyleSizeLength GetSize(StyleValueHandle handle)
        {
            if (handle.IsUndefined)
            {
                return StyleSizeLength.Undefined();
            }
            else if (handle.IsAuto)
            {
                return StyleSizeLength.OfAuto();
            }
            else if (handle.IsKeyword(StyleValueHandle.KeywordEnum.MaxContent))
            {
                return StyleSizeLength.OfMaxContent();
            }
            else if (handle.IsKeyword(StyleValueHandle.KeywordEnum.FitContent))
            {
                return StyleSizeLength.OfFitContent();
            }
            else if (handle.IsKeyword(StyleValueHandle.KeywordEnum.Stretch))
            {
                return StyleSizeLength.OfStretch();
            }
            else if (handle.HandleType == StyleValueHandle.HandleTypeEnum.Mixed)
            {
                var value = buffer_.Get64(handle.GetValue());
                return StyleSizeLength.Mixed(BitConverter.Int32BitsToSingle((int)(uint)value),
                    BitConverter.Int32BitsToSingle((int)(uint)(value >> 32)));
            }
            else
            {
                System.Diagnostics.Debug.Assert(
                    handle.HandleType == StyleValueHandle.HandleTypeEnum.Point ||
                    handle.HandleType == StyleValueHandle.HandleTypeEnum.Percent);

                float value = (handle.IsValueIndexed())
                    ? BitConverter.Int32BitsToSingle((int)buffer_.Get32(handle.GetValue()))
                    : UnpackInlineInteger(handle.GetValue());

                return handle.HandleType == StyleValueHandle.HandleTypeEnum.Point
                    ? StyleSizeLength.Points(value)
                    : StyleSizeLength.Percent(value);
            }
        }

        public FloatOptional GetNumber(StyleValueHandle handle)
        {
            if (handle.IsUndefined)
            {
                return FloatOptional.Undefined;
            }
            else
            {
                System.Diagnostics.Debug.Assert(handle.HandleType == StyleValueHandle.HandleTypeEnum.Number);
                float value = (handle.IsValueIndexed())
                    ? BitConverter.Int32BitsToSingle((int)buffer_.Get32(handle.GetValue()))
                    : UnpackInlineInteger(handle.GetValue());
                return new FloatOptional(value);
            }
        }

        private void StoreMixed(ref StyleValueHandle handle, float pixels, float percent)
        {
            ulong value = (uint)BitConverter.SingleToInt32Bits(pixels) |
                ((ulong)(uint)BitConverter.SingleToInt32Bits(percent) << 32);
            InvalidateIndexedLength(handle);
            var index = handle.IsValueIndexed()
                ? buffer_.Replace(handle.GetValue(), value) : buffer_.Push(value);
            handle.SetType(StyleValueHandle.HandleTypeEnum.Mixed);
            handle.SetValue(index);
            handle.SetValueIsIndexed();
        }

        private void StoreValue(ref StyleValueHandle handle, float value, StyleValueHandle.HandleTypeEnum type)
        {
            handle.SetType(type);

            if (handle.IsValueIndexed())
            {
                InvalidateIndexedLength(handle);
                var newIndex = buffer_.Replace(handle.GetValue(), (uint)BitConverter.SingleToInt32Bits(value));
                handle.SetValue(newIndex);
            }
            else if (IsIntegerPackable(value))
            {
                handle.SetValue(PackInlineInteger(value));
            }
            else
            {
                var newIndex = buffer_.Push((uint)BitConverter.SingleToInt32Bits(value));
                handle.SetValue(newIndex);
                handle.SetValueIsIndexed();
            }
        }

        private void StoreKeyword(ref StyleValueHandle handle, StyleValueHandle.KeywordEnum keyword)
        {
            handle.SetType(StyleValueHandle.HandleTypeEnum.Keyword);

            if (handle.IsValueIndexed())
            {
                InvalidateIndexedLength(handle);
                var newIndex = buffer_.Replace(handle.GetValue(), (uint)keyword);
                handle.SetValue(newIndex);
            }
            else
            {
                handle.SetValue((ushort)keyword);
            }
        }

        private static bool IsIntegerPackable(float f)
        {
            const ushort MaxInlineAbsValue = (1 << 11) - 1;

            int i = (int)f;
            return (float)i == f && i >= -MaxInlineAbsValue && i <= +MaxInlineAbsValue;
        }

        private static ushort PackInlineInteger(float value)
        {
            ushort isNegative = value < 0 ? (ushort)1 : (ushort)0;
            return (ushort)(
                (isNegative << 11) |
                ((int)value * (isNegative != 0 ? -1 : 1)));
        }

        private static float UnpackInlineInteger(ushort value)
        {
            const ushort ValueSignMask = 0b0000_1000_0000_0000;
            const ushort ValueMagnitudeMask = 0b0000_0111_1111_1111;
            bool isNegative = (value & ValueSignMask) != 0;
            return (value & ValueMagnitudeMask) * (isNegative ? -1 : 1);
        }

        private static StyleLength GetInlineLength(StyleValueHandle handle)
        {
            var cache = Volatile.Read(ref inlineLengthCache_);
            if (cache is null)
            {
                var newCache = new StyleLength?[InlineLengthCacheSize * 2];
                cache = Interlocked.CompareExchange(ref inlineLengthCache_, newCache, null) ?? newCache;
            }

            int cacheIndex = ((int)handle.HandleType - (int)StyleValueHandle.HandleTypeEnum.Point) * InlineLengthCacheSize + handle.GetValue();
            var cached = Volatile.Read(ref cache[cacheIndex]);
            if (cached is not null)
            {
                return cached;
            }

            float value = UnpackInlineInteger(handle.GetValue());
            var created = CreateLength(handle.HandleType, value);
            return Interlocked.CompareExchange(ref cache[cacheIndex], created, null) ?? created;
        }

        private StyleLength GetIndexedLength(StyleValueHandle handle)
        {
            ushort index = handle.GetValue();
            var cache = Volatile.Read(ref indexedLengthCache_);
            if (cache is not null && cache.TryGetValue(index, out var cached))
            {
                return cached;
            }

            StyleLength created;
            if (handle.HandleType == StyleValueHandle.HandleTypeEnum.Mixed)
            {
                var value = buffer_.Get64(index);
                created = StyleLength.Mixed(BitConverter.Int32BitsToSingle((int)(uint)value),
                    BitConverter.Int32BitsToSingle((int)(uint)(value >> 32)));
            }
            else
            {
                float value = BitConverter.Int32BitsToSingle((int)buffer_.Get32(index));
                created = CreateLength(handle.HandleType, value);
            }
            if (cache is null)
            {
                var newCache = new ConcurrentDictionary<ushort, StyleLength>();
                cache = Interlocked.CompareExchange(ref indexedLengthCache_, newCache, null) ?? newCache;
            }

            return cache.GetOrAdd(index, created);
        }

        private static StyleLength CreateLength(StyleValueHandle.HandleTypeEnum type, float value)
        {
            return type == StyleValueHandle.HandleTypeEnum.Point
                ? StyleLength.Points(value)
                : StyleLength.Percent(value);
        }

        private void InvalidateIndexedLength(StyleValueHandle handle)
        {
            if (handle.IsValueIndexed())
            {
                Volatile.Read(ref indexedLengthCache_)?.TryRemove(handle.GetValue(), out _);
            }
        }

        private void UpdatePercentageLengthCount(
            StyleValueHandle.HandleTypeEnum oldType,
            StyleValueHandle.HandleTypeEnum newType)
        {
            buffer_.UpdatePercentageLengthCount(
                oldType == StyleValueHandle.HandleTypeEnum.Percent || oldType == StyleValueHandle.HandleTypeEnum.Mixed,
                newType == StyleValueHandle.HandleTypeEnum.Percent || newType == StyleValueHandle.HandleTypeEnum.Mixed);
        }

        public StyleValuePool Clone()
        {
            var clone = new StyleValuePool();
            clone.buffer_ = buffer_.Clone();
            return clone;
        }
    }
}
