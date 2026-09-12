package Goo

import System
import System.Collections.Generic

public data struct FontVariation(Tag string, Value float32) { }

public sealed class FontSource : IDisposable {
  shared {
    private const MaxFontBytes int32 = 67108864
    private const MaxVariations int32 = 16

    private func NormalizeFamily(value string) string {
      if value == nil { throw ArgumentNullException("family") }
      return value.Trim()
    }

    internal func NormalizeFamilyKey(value string) string -> NormalizeFamily(value).ToLowerInvariant()

    private func CopyVariations(values []FontVariation) FontVariationSet {
      if values.Length == 0 {
        return FontVariationSet([]FontVariation{}, nil)
      }
      if values.Length > MaxVariations {
        throw ArgumentOutOfRangeException("variations")
      }
      let publicValues = [values.Length]FontVariation
      Array.Copy(values, publicValues, values.Length)
      let nativeValues = [values.Length]VulkanTextVariation
      var index int32 = 0
      while index < publicValues.Length {
        let value = publicValues[index]
        if value.Tag == nil || value.Tag.Length != 4 {
          throw ArgumentException("Variation tags must contain four characters", "variations")
        }
        var character int32 = 0
        while character < value.Tag.Length {
          if uint32(value.Tag[character]) > 127u {
            throw ArgumentException("Variation tags must contain ASCII characters", "variations")
          }
          character++
        }
        if Single.IsNaN(value.Value) || Single.IsInfinity(value.Value) {
          throw ArgumentException("Variation values must be finite", "variations")
        }
        nativeValues[index] = VulkanTextVariation{
          Tag: VulkanTextTag(value.Tag),
          Value: value.Value,
        }
        index++
      }
      sortVariations(publicValues, nativeValues)
      return FontVariationSet(publicValues, nativeValues)
    }
  }

  private let gate object
  private let family string
  private let familyKey string
  private let weight int32
  private let italic bool
  private let faceIndex uint32
  private let sourceId uint64
  private var payload FontSourcePayload?
  private var registered bool
  private var disposed bool

  public convenience init(family string, weight int32, italic bool, bytes []uint8) {
    init(family, weight, italic, bytes, 0u, []FontVariation{})
  }

  public init(family string, weight int32, italic bool, bytes []uint8,
    faceIndex uint32, variations []FontVariation) {
      gate = Object()
      let canonical = NormalizeFamily(family)
      if canonical.Length == 0 { throw ArgumentException("Font family is empty", "family") }
      if canonical.Contains(",") { throw ArgumentException("Font family cannot contain commas", "family") }
      if weight < 1 || weight > 1000 { throw ArgumentOutOfRangeException("weight") }
      if bytes.Length == 0 || bytes.Length > MaxFontBytes {
        throw ArgumentOutOfRangeException("bytes")
      }
      this.family = canonical
      familyKey = NormalizeFamilyKey(canonical)
      this.weight = weight
      this.italic = italic
      this.faceIndex = faceIndex
      let ownedBytes = [bytes.Length]uint8
      Array.Copy(bytes, ownedBytes, bytes.Length)
      let copied = CopyVariations(variations)
      payload = FontSourcePayload(ownedBytes, copied.Public, copied.Native)
      sourceId = FontRegistry.AllocateSourceId()
    }

  public prop Family string{ get -> family }
  public prop Weight int32{ get -> weight }
  public prop Italic bool{ get -> italic }
  public prop FaceIndex uint32{ get -> faceIndex }
  public prop Variations []FontVariation{
    get {
      lock (gate) {
        if disposed { throw ObjectDisposedException("FontSource") }
        if let current = payload {
          let result = [current.Variations.Length]FontVariation
          Array.Copy(current.Variations, result, current.Variations.Length)
          return result
        }
        throw ObjectDisposedException("FontSource")
      }
    }
  }
  public prop IsRegistered bool{
    get { lock (gate) { return registered && !disposed } }
  }
  public prop IsDisposed bool{ get { lock (gate) { return disposed } } }

  public func Register() {
    FontRegistry.Register(this)
  }

  public func Dispose() {
    var remove bool
    lock (gate) {
      if disposed { return }
      disposed = true
      remove = registered
      registered = false
      payload = nil
    }
    if remove { FontRegistry.Unregister(this) }
  }

  internal prop FamilyKey string{ get -> familyKey }
  internal prop SourceId uint64{ get -> sourceId }
  internal prop IsRegisteredInternal bool{
    get { lock (gate) { return registered && !disposed && payload != nil } }
  }

  internal func BeginRegistration(generation uint64) FontRegistration? {
    lock (gate) {
      if disposed { throw ObjectDisposedException("FontSource") }
      if registered { return nil }
      if let current = payload {
        VulkanTextFont.ValidateFace(current.Bytes, faceIndex)
        registered = true
        return FontRegistration(family, sourceId, generation, weight, italic,
          current.Bytes, faceIndex, current.NativeVariations)
      }
      throw ObjectDisposedException("FontSource")
    }
  }

}

private sealed class FontSourcePayload {
  internal let Bytes []uint8
  internal let Variations []FontVariation
  internal let NativeVariations([]VulkanTextVariation)?

  internal init(bytes []uint8, variations []FontVariation,
    nativeVariations([]VulkanTextVariation)?) {
      Bytes = bytes
      Variations = variations
      NativeVariations = nativeVariations
    }
}

private data struct FontVariationSet(Public []FontVariation,
  Native([]VulkanTextVariation)?) { }

internal sealed class FontRegistration {
  internal let Family string
  internal let SourceId uint64
  internal let Generation uint64
  internal let Weight int32
  internal let Italic bool
  internal let Bytes []uint8
  internal let FaceIndex uint32
  internal let Variations([]VulkanTextVariation)?

  internal init(family string, sourceId uint64, generation uint64, weight int32,
    italic bool, bytes []uint8, faceIndex uint32,
    variations([]VulkanTextVariation)?) {
      Family = family
      SourceId = sourceId
      Generation = generation
      Weight = weight
      Italic = italic
      Bytes = bytes
      FaceIndex = faceIndex
      Variations = variations
    }
}

internal sealed class FontRegistry {
  shared {
    private let gate object = Object()
    private let sources Dictionary[string, List[FontRegistration]] =
    Dictionary[string, List[FontRegistration]]()
    private var nextSourceId uint64 = 1uL
    private var generation uint64

    internal prop Generation uint64{ get { lock (gate) { return generation } } }

    internal func AllocateSourceId() uint64 {
      lock (gate) {
        let result = nextSourceId
        if nextSourceId == uint64.MaxValue {
          throw OverflowException("Font source identity exhausted")
        }
        nextSourceId++
        return result
      }
    }

    internal func Register(source FontSource) {
      lock (gate) {
        if source.IsRegisteredInternal { return }
        let key = source.FamilyKey
        var values List[FontRegistration]
        let hasValues = sources.TryGetValue(key, out values)
        if hasValues {
          for current in values {
            if current.Weight == source.Weight && current.Italic == source.Italic {
              throw InvalidOperationException("A font source is already registered for this family, weight, and style")
            }
          }
        }
        if generation == uint64.MaxValue {
          throw OverflowException("Font registry generation exhausted")
        }
        let nextGeneration = generation + 1uL
        let registration = source.BeginRegistration(nextGeneration)
        if registration == nil {
          return
        }
        generation = nextGeneration
        if !hasValues {
          values = List[FontRegistration]()
          sources.Add(key, values)
        }
        values.Add(registration)
      }
    }

    internal func Unregister(source FontSource) {
      lock (gate) {
        if !sources.TryGetValue(source.FamilyKey, out var values) { return }
        var index int32 = 0
        while index < values.Count {
          if values[index].SourceId == source.SourceId {
            values.RemoveAt(index)
            if values.Count == 0 { sources.Remove(source.FamilyKey) }
            if generation == uint64.MaxValue {
              throw OverflowException("Font registry generation exhausted")
            }
            generation++
            return
          }
          index++
        }
      }
    }

    internal func Resolve(family string, weight int32, italic bool) FontRegistration? {
      let key = FontSource.NormalizeFamilyKey(family)
      lock (gate) {
        if !sources.TryGetValue(key, out var values) { return nil }
        var best FontRegistration?
        var bestScore int64 = Int64.MaxValue
        for candidate in values {
          let difference = int64(candidate.Weight) - int64(weight)
          let distance = if difference < 0L { -difference } else { difference }
          let stylePenalty = if candidate.Italic == italic { 0L } else { 1000000L }
          let score = stylePenalty + distance
          if best == nil || score < bestScore
            || (score == bestScore && candidate.SourceId < best.SourceId) {
              best = candidate
              bestScore = score
            }
        }
        return best
      }
    }
  }
}

private func sortVariations(publicValues []FontVariation,
  nativeValues []VulkanTextVariation) {
    var index int32 = 1
    while index < publicValues.Length {
      let publicValue = publicValues[index]
      let nativeValue = nativeValues[index]
      var cursor = index
      while cursor > 0 && String.CompareOrdinal(publicValues[cursor - 1].Tag,
        publicValue.Tag) > 0 {
          publicValues[cursor] = publicValues[cursor - 1]
          nativeValues[cursor] = nativeValues[cursor - 1]
          cursor--
        }
      if cursor > 0 && publicValues[cursor - 1].Tag == publicValue.Tag {
        throw ArgumentException("Variation tags must be unique", "variations")
      }
      publicValues[cursor] = publicValue
      nativeValues[cursor] = nativeValue
      index++
    }
  }
