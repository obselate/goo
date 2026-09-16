package Goo

import System
import System.IO

internal data struct UnicodeRangeBounds(Starts []int32, Ends []int32) { }

internal class UnicodeData {
  shared {
    internal func Open(name string) BinaryReader {
      let stream = typeof(UnicodeData).Assembly.GetManifestResourceStream("Goo.Text.Data." + name)
      if stream == nil { throw FileNotFoundException("Goo Unicode data is missing", name) }
      return BinaryReader(stream)
    }

    internal func Find(bounds UnicodeRangeBounds, value int32) int32 {
      var low int32 = 0
      var high = bounds.Starts.Length - 1
      while low <= high {
        let middle = low + (high - low) / 2
        if value < bounds.Starts[middle] { high = middle - 1 }
        else if value > bounds.Ends[middle] { low = middle + 1 }
        else { return middle }
      }
      return -1
    }
  }
}

internal data struct UnicodeLineBreakTable(Bounds UnicodeRangeBounds,
  Classes []TextLineBreakClass) { }

internal class UnicodeLineBreakData {
  shared {
    private let table UnicodeLineBreakTable = Load()

    internal func Classify(value int32) TextLineBreakClass {
      let index = UnicodeData.Find(table.Bounds, value)
      return if index < 0 { TextLineBreakClass.XX } else { table.Classes[index] }
    }

    private func Load() UnicodeLineBreakTable {
      using let reader = UnicodeData.Open("UnicodeLineBreakData.bin")
      let count = reader.ReadInt32()
      let starts = [count]int32
      let ends = [count]int32
      let classes = [count]TextLineBreakClass
      for index in 0 ... count {
        starts[index] = reader.ReadInt32()
        ends[index] = reader.ReadInt32()
        classes[index] = TextLineBreakClass(int32(reader.ReadByte()))
      }
      return UnicodeLineBreakTable(UnicodeRangeBounds(starts, ends), classes)
    }
  }
}

internal data struct UnicodeLineBreakContextTable(Bounds UnicodeRangeBounds,
  Flags []uint8) { }

internal class UnicodeLineBreakContext {
  shared {
    internal const EastAsian uint8 = 1u
    internal const InitialQuote uint8 = 2u
    internal const FinalQuote uint8 = 4u
    internal const ExtendedPictographic uint8 = 8u
    internal const ExtendedPictographicUnassigned uint8 = 16u
    internal const CombiningMark uint8 = 32u
    private let table UnicodeLineBreakContextTable = Load()

    internal func Classify(value int32) uint8 {
      let index = UnicodeData.Find(table.Bounds, value)
      return if index < 0 { uint8(0) } else { table.Flags[index] }
    }

    private func Load() UnicodeLineBreakContextTable {
      using let reader = UnicodeData.Open("UnicodeLineBreakContext.bin")
      let count = reader.ReadInt32()
      let starts = [count]int32
      let ends = [count]int32
      let flags = [count]uint8
      for index in 0 ... count {
        starts[index] = reader.ReadInt32()
        ends[index] = reader.ReadInt32()
        flags[index] = reader.ReadByte()
      }
      return UnicodeLineBreakContextTable(UnicodeRangeBounds(starts, ends), flags)
    }
  }
}

internal enum UnicodeGraphemeClass {
  Other;
  CR;
  LF;
  Control;
  Extend;
  ZWJ;
  RegionalIndicator;
  Prepend;
  SpacingMark;
  L;
  V;
  T;
  LV;
  LVT;
}

internal enum UnicodeGraphemeInCB {
  None;
  Consonant;
  Extend;
  Linker;
}

internal data struct UnicodeGraphemeInfo(Class UnicodeGraphemeClass,
  InCB UnicodeGraphemeInCB, ExtendedPictographic bool) { }

internal data struct UnicodeGraphemeTable(Bounds UnicodeRangeBounds,
  Classes []UnicodeGraphemeClass, InCB []UnicodeGraphemeInCB,
  ExtendedPictographic []bool) { }

internal class UnicodeGraphemeData {
  shared {
    private let table UnicodeGraphemeTable = Load()

    internal func Classify(value int32) UnicodeGraphemeInfo {
      let index = UnicodeData.Find(table.Bounds, value)
      if index < 0 {
        return UnicodeGraphemeInfo(UnicodeGraphemeClass.Other,
          UnicodeGraphemeInCB.None, false)
      }
      return UnicodeGraphemeInfo(table.Classes[index], table.InCB[index],
        table.ExtendedPictographic[index])
    }

    private func Load() UnicodeGraphemeTable {
      using let reader = UnicodeData.Open("UnicodeGraphemeData.bin")
      let count = reader.ReadInt32()
      let starts = [count]int32
      let ends = [count]int32
      let classes = [count]UnicodeGraphemeClass
      let inCB = [count]UnicodeGraphemeInCB
      let pictographic = [count]bool
      for index in 0 ... count {
        starts[index] = reader.ReadInt32()
        ends[index] = reader.ReadInt32()
        classes[index] = UnicodeGraphemeClass(int32(reader.ReadByte()))
        inCB[index] = UnicodeGraphemeInCB(int32(reader.ReadByte()))
        pictographic[index] = reader.ReadBoolean()
      }
      return UnicodeGraphemeTable(UnicodeRangeBounds(starts, ends), classes,
        inCB, pictographic)
    }
  }
}

internal data struct UnicodeScriptTable(Bounds UnicodeRangeBounds, Tags []uint32) { }

internal class UnicodeScriptsData {
  shared {
    internal const CommonTag uint32 = 1517910393u
    internal const InheritedTag uint32 = 1516858984u
    internal const UnknownTag uint32 = 1517976186u
    private let table UnicodeScriptTable = Load()

    internal func Classify(value int32) uint32 {
      let index = UnicodeData.Find(table.Bounds, value)
      return if index < 0 { UnknownTag } else { table.Tags[index] }
    }

    private func Load() UnicodeScriptTable {
      using let reader = UnicodeData.Open("UnicodeScriptsData.bin")
      let count = reader.ReadInt32()
      let starts = [count]int32
      let ends = [count]int32
      let tags = [count]uint32
      for index in 0 ... count {
        starts[index] = reader.ReadInt32()
        ends[index] = reader.ReadInt32()
        tags[index] = reader.ReadUInt32()
      }
      return UnicodeScriptTable(UnicodeRangeBounds(starts, ends), tags)
    }
  }
}

internal data struct UnicodeScriptExtensionTable(Bounds UnicodeRangeBounds,
  Offsets []int32, Counts []int32, Tags []uint32) { }

internal class UnicodeScriptExtensionsData {
  shared {
    private let table UnicodeScriptExtensionTable = Load()

    internal func Contains(value int32, script uint32) bool {
      let index = UnicodeData.Find(table.Bounds, value)
      if index < 0 { return UnicodeScriptsData.Classify(value) == script }
      var offset = table.Offsets[index]
      let end = offset + table.Counts[index]
      while offset < end {
        if table.Tags[offset] == script { return true }
        offset++
      }
      return false
    }

    internal func AllowsAny(value int32) bool {
      let index = UnicodeData.Find(table.Bounds, value)
      if index < 0 {
        let script = UnicodeScriptsData.Classify(value)
        return script == UnicodeScriptsData.CommonTag
          || script == UnicodeScriptsData.InheritedTag
      }
      var offset = table.Offsets[index]
      let end = offset + table.Counts[index]
      while offset < end {
        let script = table.Tags[offset]
        if script == UnicodeScriptsData.CommonTag
          || script == UnicodeScriptsData.InheritedTag{ return true }
        offset++
      }
      return false
    }

    private func Load() UnicodeScriptExtensionTable {
      using let reader = UnicodeData.Open("UnicodeScriptExtensionsData.bin")
      let tagCount = reader.ReadInt32()
      let tags = [tagCount]uint32
      for index in 0 ... tagCount { tags[index] = reader.ReadUInt32() }
      let count = reader.ReadInt32()
      let starts = [count]int32
      let ends = [count]int32
      let offsets = [count]int32
      let counts = [count]int32
      for index in 0 ... count {
        starts[index] = reader.ReadInt32()
        ends[index] = reader.ReadInt32()
        offsets[index] = reader.ReadInt32()
        counts[index] = reader.ReadInt32()
      }
      return UnicodeScriptExtensionTable(UnicodeRangeBounds(starts, ends),
        offsets, counts, tags)
    }
  }
}
