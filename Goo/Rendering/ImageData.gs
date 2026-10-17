package Goo

import System

internal sealed class DecodedImage {
  shared {
    private let failed DecodedImage = DecodedImage()

    internal prop Failed DecodedImage{ get -> failed }

    internal func FromRgba(width int32, height int32, source []uint8) DecodedImage {
      if width <= 0 || height <= 0 {
        return Failed
      }
      if int64(width) > Int64.MaxValue / int64(height) / int64(4) {
        return Failed
      }
      let required = int64(width) * int64(height) * int64(4)
      if required != int64(source.Length) || required > int64(Int32.MaxValue) {
        return Failed
      }
      let owned = [source.Length]uint8
      Array.Copy(source, owned, source.Length)
      return DecodedImage(width, height, owned)
    }

    internal func FromTransferredRgba(width int32, height int32, source []uint8,
      released Action) DecodedImage -> DecodedImage(width, height, source, released)
  }

  private let gate object
  private var pixels([]uint8)?
  private var references int32
  private var disposed bool
  private var released Action?

  private init() {
    gate = Object()
    pixels = nil
  }

  private init(width int32, height int32, owned []uint8) {
    gate = Object()
    Width = width
    Height = height
    pixels = owned
    references = 1
    if let recorder = FrameRecorder.Current { Profile(recorder, false) }
  }

  private init(width int32, height int32, owned []uint8, release Action) {
    gate = Object()
    Width = width
    Height = height
    pixels = owned
    references = 1
    released = release
    if let recorder = FrameRecorder.Current { Profile(recorder, false) }
  }

  internal prop Width int32{ get; private set; }
  internal prop Height int32{ get; private set; }
  internal prop IsValid bool{ get -> pixels != nil && !disposed }

  internal func Profile(recorder FrameRecorder, baseline bool) uint64 {
    let id = recorder.ManagedResource(this, out var first)
    if first || !baseline {
      recorder.Resource(FrameResourceKind.ImageSource, id, VulkanDiagnosticEventIds.ResourceCreate,
        "image.decoded", bytes: uint64(Width) * uint64(Height) * 4uL,
        width: Width, height: Height, baseline: baseline)
    }
    return id
  }

  internal func Retain() {
    lock gate {
      if pixels == nil || disposed {
        return
      }
      references++
    }
  }

  internal func Release() {
    var completion Action?
    lock gate {
      if pixels == nil || disposed {
        return
      }
      references--
      if references == 0 {
        if let recorder = FrameRecorder.Current {
          recorder.Resource(FrameResourceKind.ImageSource, Profile(recorder, true),
            VulkanDiagnosticEventIds.ResourceEvict, "image.decoded.release")
        }
        disposed = true
        pixels = nil
        completion = released
        released = nil
      }
    }
    if let current = completion {
      try { current.Invoke() } catch (error Exception) { }
    }
  }

  internal func Pixels()([]uint8)? {
    lock gate { return pixels }
  }
}
