package GooAsyncReadbackSmoke

import Goo
import System

data struct PerformanceImageEffectsCardInput {
  internal var Seed uint64
  internal var Index int32
  internal var Row int32
  internal var Column int32
  internal var ImageSlot int32
  internal var Provider ImageSourceProvider
  internal var Revision int32
  internal var Radius float64
  internal var BorderWidth float64
  internal var Opacity float64
  internal var ShadowBlur float64
  internal var ShadowSpread float64
  internal var Blend BlendMode
}

class PerformanceImageEffectsProvider : ImageSourceProvider {
  private var source ImageSource
  private var version uint64
  private var disposed bool

  init(initial ImageSource) {
    source = initial
    version = 1uL
  }

  public prop ContentVersion uint64{ get -> version }
  public event ContentChanged Action

  public func Acquire() ImageSourceLease -> source.Acquire()

  internal prop Width int32{ get -> source.Width }
  internal prop Height int32{ get -> source.Height }

  internal func Replace(next ImageSource) {
    if disposed {
      next.Dispose()
      throw ObjectDisposedException("PerformanceImageEffectsProvider")
    }
    if version == UInt64.MaxValue {
      next.Dispose()
      throw InvalidOperationException("Image provider content version overflow")
    }
    let prior = source
    source = next
    version = version + 1uL
    try {
      let changed = ContentChanged
      changed?.Invoke()
    } finally {
      prior.Dispose()
    }
  }
  internal func DisposeSource() {
    if disposed {
      return
    }
    disposed = true
    source.Dispose()
  }
}

func PerformanceImageEffectsPhase(seed uint64, index int32, revision int32, modulus int32) int32 {
  let value = (seed
    +uint64(index) * 2654435761uL
    +uint64(revision) * 2246822519uL) % uint64(modulus)
  return int32(value)
}

func PerformanceImageEffectsPixels(seed uint64, slot int32, revision int32) []uint8 {
  let pixels = [256 * 256 * 4]uint8
  var pixel int32 = 0
  while pixel < 256 * 256 {
    let x = pixel % 256
    let y = pixel / 256
    let phase = seed
    +uint64(slot) * 2654435761uL
    +uint64(revision) * 2246822519uL
    +uint64(x) * 3266489917uL
    +uint64(y) * 668265263uL
    let offset = pixel * 4
    pixels[offset] = uint8((phase + 31uL) % 224uL + 16uL)
    pixels[offset + 1] = uint8((phase + uint64(x * 13 + y * 7) + 67uL) % 224uL + 16uL)
    pixels[offset + 2] = uint8((phase + uint64(x * 5 + y * 17) + 109uL) % 224uL + 16uL)
    pixels[offset + 3] = uint8(255)
    pixel = pixel + 1
  }
  return pixels
}

func PerformanceImageEffectsOpacity(seed uint64, index int32, revision int32) float64 -> 0.68 + float64(PerformanceImageEffectsPhase(seed, index, revision, 13)) * 0.02

func PerformanceImageEffectsRadius(seed uint64, index int32, revision int32) float64 -> 5.0 + float64(PerformanceImageEffectsPhase(seed, index, revision, 8))

func PerformanceImageEffectsBorderWidth(seed uint64, index int32, revision int32) float64 -> 1.0 + float64(PerformanceImageEffectsPhase(seed, index, revision, 3))

func PerformanceImageEffectsShadowBlur(seed uint64, index int32, revision int32) float64 -> 3.0 + float64(PerformanceImageEffectsPhase(seed, index, revision, 7))

func PerformanceImageEffectsShadowSpread(seed uint64, index int32, revision int32) float64 -> float64(PerformanceImageEffectsPhase(seed, index, revision, 3))
func PerformanceImageEffectsRoundedClip(seed uint64, index int32) bool -> PerformanceImageEffectsPhase(seed, index, 0, 256) < 8

func PerformanceImageEffectsBlend(seed uint64, index int32, revision int32) BlendMode {
  let value = PerformanceImageEffectsPhase(seed, index, 0, 256)
  if value >= 8 {
    return BlendMode.Normal
  }
  switch value % 4 {
    case 0 { return BlendMode.Multiply }
    case 1 { return BlendMode.Screen }
    case 2 { return BlendMode.Overlay }
    default { return BlendMode.Difference }
  }
}

func PerformanceImageEffectsColor(seed uint64, index int32, revision int32, channel int32) Color {
  let value = PerformanceImageEffectsPhase(
    seed + uint64(channel) * 131uL, index, revision, 176)
  let red = 48 + (value * 5) % 176
  let green = 40 + (value * 7 + channel * 17) % 176
  let blue = 56 + (value * 11 + channel * 23) % 176
  return Color.Rgb(red, green, blue)
}

func PerformanceImageEffectsGradient(seed uint64, index int32, revision int32) LinearGradient -> LinearGradient(90.0, []GradientStop {
  GradientStop{
    Offset: 0.0,
    Color: PerformanceImageEffectsColor(seed, index, revision, 0),
  },
  GradientStop{
    Offset: 0.5,
    Color: PerformanceImageEffectsColor(seed, index, revision, 1),
  },
  GradientStop{
    Offset: 1.0,
    Color: PerformanceImageEffectsColor(seed, index, revision, 2),
  },
})

open class PerformanceImageEffectsCard : Cell[PerformanceImageEffectsCardInput] {
  protected override func Build(input PerformanceImageEffectsCardInput) Blob {
    let borderColor = PerformanceImageEffectsColor(
      input.Seed, input.Index, input.Revision, 3)
    let shadowColor = Color.Rgba(0, 0, 0, 172)
    let overlay = Container{
      Position: PositionType.Absolute,
      Left: 0.0,
      Top: 0.0,
      Width: Length.Percent(100),
      Height: Length.Percent(100),
      Opacity: 0.24,
      BackgroundGradient: PerformanceImageEffectsGradient(
        input.Seed, input.Index, input.Revision),
      BlendMode: input.Blend,
    }
    return Container() {.Position: PositionType.Absolute,.Left: float64(input.Column) * 120.0,.Top: float64(input.Row) * 67.5,.Width: 120.0,.Height: 67.5,.BorderRadius: input.Radius,.Overflow: if PerformanceImageEffectsRoundedClip(input.Seed, input.Index) {
        Overflow.Hidden
      } else {
        Overflow.Visible
      },.BorderStyle: BorderStyle.Solid,.BorderWidth: input.BorderWidth,.BorderColor: borderColor,.BoxShadow: BoxShadow{
        OffsetX: 2.0,
        OffsetY: 3.0,
        Blur: input.ShadowBlur,
        Spread: input.ShadowSpread,
        Color: shadowColor,
      },.Opacity: 1.0,.BlendMode: BlendMode.Normal,.BackgroundGradient: PerformanceImageEffectsGradient(
        input.Seed, input.Index, input.Revision),
      Image{
          Width: Length.Percent(100),
          Height: Length.Percent(100),
          Source: input.Provider,
          Fit: ImageFit.Cover,
          Opacity: input.Opacity,
        },
        overlay,
    }
  }
}

class PerformanceImageEffectsRoot : Cell {
  shared {
    const PerformanceImageEffectsSeed uint64 = 668265263uL
    const PerformanceImageEffectsWidth int32 = 1920
    const PerformanceImageEffectsHeight int32 = 1080
    const PerformanceImageEffectsProviders int32 = 64
    const PerformanceImageEffectsCards int32 = 256
    const PerformanceImageEffectsMutations int32 = 8
  }

  private let seed uint64
  private let providers []PerformanceImageEffectsProvider
  private let cardKeys []string
  private let cardRevisions []int32
  private let mutationIndices []int32
  private var replacementSlot int32
  private var advanceOrdinal int32

  internal prop LogicalCount int64{ get -> int64(PerformanceImageEffectsCards) }
  internal prop LogicalEdges int32{ get -> 0 }
  internal prop VisibleCount int32{ get -> PerformanceImageEffectsCards }
  internal prop MountedCount int32{ get -> PerformanceImageEffectsCards }
  internal prop MountedBound int32{ get -> PerformanceImageEffectsCards }
  internal prop Width int32{ get -> PerformanceImageEffectsWidth }
  internal prop Height int32{ get -> PerformanceImageEffectsHeight }
  internal prop MutationCount int32{ get -> PerformanceImageEffectsMutations }

  init() {
    seed = PerformanceImageEffectsSeed
    providers = [PerformanceImageEffectsProviders]PerformanceImageEffectsProvider
    cardKeys = [PerformanceImageEffectsCards]string
    cardRevisions = [PerformanceImageEffectsCards]int32
    mutationIndices = [PerformanceImageEffectsMutations]int32
    var slot int32 = 0
    while slot < PerformanceImageEffectsProviders {
      providers[slot] = PerformanceImageEffectsProvider(
        ImageSource(256, 256, PerformanceImageEffectsPixels(seed, slot, 0)))
      slot = slot + 1
    }
    var index int32 = 0
    while index < PerformanceImageEffectsCards {
      cardKeys[index] = "perf-image-effects-card-" + index.ToString()
      cardRevisions[index] = 0
      index = index + 1
    }
    let initialBase = int32(seed % uint64(PerformanceImageEffectsCards))
    var mutation int32 = 0
    while mutation < PerformanceImageEffectsMutations {
      mutationIndices[mutation] =
      (initialBase + mutation) % PerformanceImageEffectsCards
      mutation = mutation + 1
    }
    replacementSlot = int32(seed % uint64(PerformanceImageEffectsProviders))
  }
  internal func DisposeSources() {
    var slot int32 = 0
    while slot < PerformanceImageEffectsProviders {
      providers[slot].DisposeSource()
      slot = slot + 1
    }
  }

  internal func Advance(frame int32) {
    if advanceOrdinal == Int32.MaxValue {
      throw InvalidOperationException("Image effects advance ordinal overflow")
    }
    advanceOrdinal = advanceOrdinal + 1
    var frameValue int64 = int64(frame)
    if frameValue < 0 {
      frameValue = -frameValue
    }
    replacementSlot = int32((uint64(frameValue) * 17uL + seed)
      % uint64(PerformanceImageEffectsProviders))
    providers[replacementSlot].Replace(ImageSource(
      256, 256, PerformanceImageEffectsPixels(seed, replacementSlot, advanceOrdinal)))
    let mutationBase = int32((seed
      +uint64(advanceOrdinal) * uint64(PerformanceImageEffectsMutations))
      % uint64(PerformanceImageEffectsCards))
    var mutation int32 = 0
    while mutation < PerformanceImageEffectsMutations {
      let index = (mutationBase + mutation) % PerformanceImageEffectsCards
      mutationIndices[mutation] = index
      cardRevisions[index] = advanceOrdinal
      mutation = mutation + 1
    }
    Rebuild()
  }

  internal func Invariant() bool {
    if seed != PerformanceImageEffectsSeed
      || providers.Length != PerformanceImageEffectsProviders
      || cardKeys.Length != PerformanceImageEffectsCards
      || cardRevisions.Length != PerformanceImageEffectsCards
      || mutationIndices.Length != PerformanceImageEffectsMutations{
        return false
      }
    if LogicalCount != int64(PerformanceImageEffectsCards)
      || LogicalEdges != 0
      || VisibleCount != PerformanceImageEffectsCards
      || MountedCount != PerformanceImageEffectsCards
      || MountedBound != PerformanceImageEffectsCards
      || Width != PerformanceImageEffectsWidth
      || Height != PerformanceImageEffectsHeight
      || MutationCount != PerformanceImageEffectsMutations{
        return false
      }
    if replacementSlot < 0 || replacementSlot >= PerformanceImageEffectsProviders {
      return false
    }
    var slot int32 = 0
    while slot < PerformanceImageEffectsProviders {
      if Object.ReferenceEquals(providers[slot], nil)
        || providers[slot].Width != 256
        || providers[slot].Height != 256
        || providers[slot].ContentVersion == 0uL {
          return false
        }
      slot = slot + 1
    }
    var nonNormalCount int32 = 0
    var roundedClipCount int32 = 0
    var index int32 = 0

    while index < PerformanceImageEffectsCards {
      if cardKeys[index] != "perf-image-effects-card-" + index.ToString()
        || cardRevisions[index] < 0 {
          return false
        }
      let opacity = PerformanceImageEffectsOpacity(seed, index, cardRevisions[index])
      let radius = PerformanceImageEffectsRadius(seed, index, cardRevisions[index])
      let borderWidth = PerformanceImageEffectsBorderWidth(
        seed, index, cardRevisions[index])
      let shadowBlur = PerformanceImageEffectsShadowBlur(
        seed, index, cardRevisions[index])
      let shadowSpread = PerformanceImageEffectsShadowSpread(
        seed, index, cardRevisions[index])
      if Double.IsNaN(opacity) || Double.IsInfinity(opacity)
        || opacity <= 0.0 || opacity > 1.0
        || Double.IsNaN(radius) || Double.IsInfinity(radius)
        || radius <= 0.0 || radius > 33.75
        || Double.IsNaN(borderWidth) || Double.IsInfinity(borderWidth)
        || borderWidth <= 0.0 || borderWidth > 4.0
        || Double.IsNaN(shadowBlur) || Double.IsInfinity(shadowBlur)
        || shadowBlur < 0.0 || shadowBlur > 16.0
        || Double.IsNaN(shadowSpread) || Double.IsInfinity(shadowSpread)
        || shadowSpread < 0.0 || shadowSpread > 4.0 {
          return false
        }
      let blend = PerformanceImageEffectsBlend(seed, index, cardRevisions[index])
      switch blend {
        case BlendMode.Normal { }
        case BlendMode.Multiply {
          nonNormalCount = nonNormalCount + 1
        }
        case BlendMode.Screen {
          nonNormalCount = nonNormalCount + 1
        }
        case BlendMode.Overlay {
          nonNormalCount = nonNormalCount + 1
        }
        case BlendMode.Difference {
          nonNormalCount = nonNormalCount + 1
        }
        default { return false }
      }
      if PerformanceImageEffectsRoundedClip(seed, index) {
        roundedClipCount = roundedClipCount + 1
      }

      index = index + 1
    }
    if roundedClipCount != PerformanceImageEffectsMutations
      || nonNormalCount != PerformanceImageEffectsMutations{
        return false
      }
    var mutation int32 = 0
    while mutation < PerformanceImageEffectsMutations {
      let index = mutationIndices[mutation]
      if index < 0 || index >= PerformanceImageEffectsCards
        || cardRevisions[index] != advanceOrdinal{
          return false
        }
      var prior int32 = 0
      while prior < mutation {
        if mutationIndices[prior] == index {
          return false
        }
        prior = prior + 1
      }
      mutation = mutation + 1
    }
    return true
  }

  override func Build() Blob {
    let canvas = Container() {.Key: "perf-image-effects-canvas",.Position: PositionType.Absolute,.Left: 0.0,.Top: 0.0,.Width: PerformanceImageEffectsWidth,.Height: PerformanceImageEffectsHeight,
    }
    var index int32 = 0
    while index < PerformanceImageEffectsCards {
      let row = index / 16
      let column = index % 16
      let imageSlot = index % PerformanceImageEffectsProviders
      let revision = cardRevisions[index]
      canvas.Children.Add(Cell.Mount[PerformanceImageEffectsCardInput, PerformanceImageEffectsCard](
        cardKeys[index],
        PerformanceImageEffectsCardInput{
          Seed: seed,
          Index: index,
          Row: row,
          Column: column,
          ImageSlot: imageSlot,
          Provider: providers[imageSlot],
          Revision: revision,
          Radius: PerformanceImageEffectsRadius(seed, index, revision),
          BorderWidth: PerformanceImageEffectsBorderWidth(seed, index, revision),
          Opacity: PerformanceImageEffectsOpacity(seed, index, revision),
          ShadowBlur: PerformanceImageEffectsShadowBlur(seed, index, revision),
          ShadowSpread: PerformanceImageEffectsShadowSpread(seed, index, revision),
          Blend: PerformanceImageEffectsBlend(seed, index, revision),
        }))
      index = index + 1
    }
    return Container() {.Width: PerformanceImageEffectsWidth,.Height: PerformanceImageEffectsHeight,.Position: PositionType.Relative,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(8, 13, 22),
      canvas,
    }
  }
}
