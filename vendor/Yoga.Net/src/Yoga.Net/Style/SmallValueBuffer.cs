using System;
using System.Collections.Generic;

namespace Facebook.Yoga
{
    public class SmallValueBuffer<BufferSize> where BufferSize : struct, IConstant
    {
        private sealed class Overflow
        {
            public List<uint> Buffer = new();
            public List<bool> WideElements = new();
        }

        private const int MaxBufferSize = 4096;

        private ushort _count;
        private byte _percentageLengthCount;
        private uint[]? _buffer;
        private bool[]? _wideElements;
        private Overflow? _overflow;

        private int BufferSizeValue => default(BufferSize).Value;

        public SmallValueBuffer()
        {
        }

        private SmallValueBuffer(SmallValueBuffer<BufferSize> other)
        {
            _count = other._count;
            _percentageLengthCount = other._percentageLengthCount;
            _buffer = (uint[]?)other._buffer?.Clone();
            _wideElements = (bool[]?)other._wideElements?.Clone();

            if (other._overflow != null)
            {
                _overflow = new Overflow
                {
                    Buffer = new List<uint>(other._overflow.Buffer),
                    WideElements = new List<bool>(other._overflow.WideElements)
                };
            }
        }

        public ushort Push(uint value)
        {
            var index = _count++;
            if (index >= MaxBufferSize)
            {
                throw new InvalidOperationException("SmallValueBuffer can only hold up to 4096 chunks");
            }

            if (index < BufferSizeValue)
            {
                _buffer ??= new uint[BufferSizeValue];
                _buffer[index] = value;
                return index;
            }

            _overflow ??= new Overflow();

            _overflow.Buffer.Add(value);
            _overflow.WideElements.Add(false);
            return index;
        }

        public bool HasPercentageLength() => _percentageLengthCount != 0;

        public void UpdatePercentageLengthCount(bool wasPercentage, bool isPercentage)
        {
            if (wasPercentage == isPercentage) return;
            if (isPercentage) _percentageLengthCount++;
            else _percentageLengthCount--;
        }

        public ushort Push(ulong value)
        {
            var lsb = (uint)(value & 0xFFFFFFFF);
            var msb = (uint)(value >> 32);

            var lsbIndex = Push(lsb);
            var msbIndex = Push(msb);

            if (msbIndex >= MaxBufferSize)
            {
                throw new InvalidOperationException("SmallValueBuffer can only hold up to 4096 chunks");
            }

            if (lsbIndex < BufferSizeValue)
            {
                _wideElements ??= new bool[BufferSizeValue];
                _wideElements[lsbIndex] = true;
            }
            else
            {
                _overflow!.WideElements[lsbIndex - BufferSizeValue] = true;
            }

            return lsbIndex;
        }

        public ushort Replace(ushort index, uint value)
        {
            if (index < BufferSizeValue)
            {
                _buffer ??= new uint[BufferSizeValue];
                _buffer[index] = value;
            }
            else
            {
                _overflow!.Buffer[index - BufferSizeValue] = value;
            }

            return index;
        }

        public ushort Replace(ushort index, ulong value)
        {
            bool isWide = index < BufferSizeValue
                ? _wideElements?[index] ?? false
                : _overflow!.WideElements[index - BufferSizeValue];

            if (isWide)
            {
                var lsb = (uint)(value & 0xFFFFFFFF);
                var msb = (uint)(value >> 32);

                Replace(index, lsb);
                Replace((ushort)(index + 1), msb);
                return index;
            }
            else
            {
                return Push(value);
            }
        }

        public uint Get32(ushort index)
        {
            if (index < BufferSizeValue)
            {
                return _buffer is null ? 0 : _buffer[index];
            }
            else
            {
                if (_overflow == null)
                {
                    throw new InvalidOperationException(
                        $"SmallValueBuffer.Get32: index {index} >= inline buffer size {BufferSizeValue} but overflow is null (count={_count})");
                }

                int overflowIndex = index - BufferSizeValue;
                if (overflowIndex >= _overflow.Buffer.Count)
                {
                    throw new InvalidOperationException(
                        $"SmallValueBuffer.Get32: overflow index {overflowIndex} >= overflow count {_overflow.Buffer.Count} (raw index={index}, count={_count})");
                }

                return _overflow.Buffer[overflowIndex];
            }
        }

        public ulong Get64(ushort index)
        {
            var lsb = Get32(index);
            var msb = Get32((ushort)(index + 1));
            return ((ulong)msb << 32) | lsb;
        }

        public SmallValueBuffer<BufferSize> Clone()
        {
            return new SmallValueBuffer<BufferSize>(this);
        }
    }

    public interface IConstant
    {
        int Value { get; }
    }
}
