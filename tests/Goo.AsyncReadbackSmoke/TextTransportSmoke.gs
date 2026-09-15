package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class TextTransportCell : Cell {
  shared {
    let Entry ElementHandle = ElementHandle{}
  }

  private var Mutated bool

  init() {
    Mutated = false
  }

  func Mutate() {
    Mutated = true
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: 96,.Height: 64,
    Text{
        Content: Mutated ? "BCDA" : "ABCD",
        Position: PositionType.Absolute,
        Left: 8,
        Top: 12,
        Width: 48,
        Height: 24,
        FontSize: 16,
        TextWrap: TextWrap.NoWrap,
        TextTrimming: TextTrimming.Ellipsis,
        Color: Color.Rgb(220, 64, 48),
      },
      Text{
        Content: "WXYZ",
        Position: PositionType.Absolute,
        Left: 8,
        Top: 36,
        Width: 48,
        Height: 24,
        FontSize: 16,
        TextWrap: TextWrap.NoWrap,
        TextTrimming: TextTrimming.Ellipsis,
        Color: Color.Rgb(48, 144, 220),
      },
      TextEntry{
        Handle: Entry,
        Value: "QRST",
        Position: PositionType.Absolute,
        Left: 48,
        Top: 0,
        Width: 40,
        Height: 20,
        FontSize: 16,
        Color: Color.Rgb(220, 220, 220),
    },
  }
}

func RunTextTransportSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = TextTransportCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var initialText VulkanTextFrameRetentionTestSnapshot{}
  var warmText VulkanTextFrameRetentionTestSnapshot{}
  var partialText VulkanTextFrameRetentionTestSnapshot{}
  var initialPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var initialClip VulkanClipMaskRetentionTestSnapshot{}
  var initialScene VulkanSceneRetentionTestSnapshot{}
  var warmScene VulkanSceneRetentionTestSnapshot{}
  var partialScene VulkanSceneRetentionTestSnapshot{}
  var focusedScene VulkanSceneRetentionTestSnapshot{}
  var sawInitial bool = false
  var sawWarm bool = false
  var sawPartial bool = false
  var initialFrame int32 = 0
  var warmFrame int32 = 0
  var partialFrame int32 = 0
  var batchedDraws uint64 = 0uL
  try {
    let opened = Window{
      Title: "Goo Retained text transport gate",
      Width: 96,
      Height: 64,
      Background: Color.Transparent,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    while initialFrame < 12 && !sawInitial {
      WindowReadbackTestFixture.ForceRender(opened, 0.0)
      let nextText = WindowReadbackTestFixture.TextFrameRetention(opened)
      if nextText.SegmentCount >= 2
        && nextText.RecordCount > 0
        && nextText.ByteCount > 0uL
        && nextText.FullUpload
        && nextText.WrittenBytes == nextText.ByteCount
        && nextText.DirtySegmentCount == nextText.SegmentCount
        && nextText.UploadRangeCount == 1
        && nextText.MappedWrites == 1uL {
          initialText = nextText
          initialPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
          initialClip = WindowReadbackTestFixture.ClipMaskRetention(opened)
          initialScene = WindowReadbackTestFixture.SceneRetention(opened)
          sawInitial = true
        }
      initialFrame = initialFrame + 1
    }
    Require(sawInitial,
      "Retained initial text transport did not force a complete upload")
    Require(initialText.ByteCount > 0uL,
      "Retained initial text transport has no text bytes")
    Require(initialClip.MaskCount == 0
        && initialClip.ByteCount == 16uL,
      "Retained text transport clip payload is not the no-mask 16-byte header")
    Require(initialPrimitive.RecordCount < initialText.RecordCount,
      "Retained analytic capacity included text records")
    Require(initialScene.RetainedTextRebuildCount >= 3uL,
      "Retained initial text did not capture both text nodes and the entry")

    while warmFrame < 12 && !sawWarm {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      let nextText = WindowReadbackTestFixture.TextFrameRetention(opened)
      if !nextText.FullUpload {
        warmText = nextText
        warmScene = WindowReadbackTestFixture.SceneRetention(opened)
        sawWarm = true
      }
      warmFrame = warmFrame + 1
    }
    Require(sawWarm,
      "Retained unchanged text transport did not produce a warmed slot")
    Require(warmText.SegmentCount == initialText.SegmentCount
        && warmText.RecordCount == initialText.RecordCount
        && warmText.ByteCount == initialText.ByteCount
        && !warmText.FullUpload
        && warmText.WrittenBytes == 0uL
        && warmText.SkippedBytes == warmText.ByteCount
        && warmText.DirtySegmentCount == 0
        && warmText.UploadRangeCount == 0
        && warmText.MappedWrites == 0uL
        && warmText.Flushes == 0uL
        && warmText.RetainedReuse == uint64(warmText.RecordCount),
      "Retained unchanged text transport did not retain the warmed slot")
    let beforeBatch = WindowReadbackTestFixture.DiagnosticCounters(opened)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let afterBatch = WindowReadbackTestFixture.DiagnosticCounters(opened)
    Require(afterBatch.drawCount >= beforeBatch.drawCount,
      "Retained text draw counter moved backwards")
    batchedDraws = afterBatch.drawCount - beforeBatch.drawCount
    Require(batchedDraws > 0uL
        && batchedDraws < uint64(warmText.SegmentCount),
      "Compatible retained text segments did not batch")
    let warmTextTotal = warmScene.RetainedTextTotalCount
    -initialScene.RetainedTextTotalCount
    let warmTextHits = warmScene.RetainedTextHitCount
    -initialScene.RetainedTextHitCount
    Require(warmTextTotal >= 3uL
        && warmTextHits == warmTextTotal
        && warmScene.RetainedTextRebuildCount == initialScene.RetainedTextRebuildCount
        && warmScene.RetainedTextFallbackCount == initialScene.RetainedTextFallbackCount
        && warmScene.RetainedTextInvalidationCount
      == initialScene.RetainedTextInvalidationCount,
      "Retained unchanged text did not retain without rebuild or invalidation")

    root.Mutate()
    while partialFrame < 12 && !sawPartial {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      let nextText = WindowReadbackTestFixture.TextFrameRetention(opened)
      if !nextText.FullUpload && nextText.DirtySegmentCount == 1 {
        partialText = nextText
        partialScene = WindowReadbackTestFixture.SceneRetention(opened)
        sawPartial = true
      }
      partialFrame = partialFrame + 1
    }
    Require(sawPartial,
      "Retained mutated text transport did not produce a warmed partial update")
    Require(partialText.SegmentCount == initialText.SegmentCount
        && partialText.RecordCount == initialText.RecordCount
        && partialText.ByteCount == initialText.ByteCount
        && partialText.TopologyKey == initialText.TopologyKey
        && !partialText.FullUpload
        && partialText.DirtySegmentCount == 1
        && partialText.DirtySegmentCount < partialText.SegmentCount
        && partialText.WrittenBytes > 0uL
        && partialText.WrittenBytes < partialText.ByteCount
        && partialText.UploadRangeCount == 1
        && partialText.MappedWrites == 1uL,
      "Retained mutated text transport did not produce one dirty segment")
    let partialTextTotal = partialScene.RetainedTextTotalCount
    -warmScene.RetainedTextTotalCount
    let partialTextHits = partialScene.RetainedTextHitCount
    -warmScene.RetainedTextHitCount
    let partialTextRebuilds = partialScene.RetainedTextRebuildCount
    -warmScene.RetainedTextRebuildCount
    let partialTextInvalidations = partialScene.RetainedTextInvalidationCount
    -warmScene.RetainedTextInvalidationCount
    Require(partialTextTotal >= 2uL
        && partialTextRebuilds == 1uL
        && partialTextInvalidations == 1uL
        && partialTextHits == partialTextTotal - 1uL
        && partialScene.RetainedTextFallbackCount
      == warmScene.RetainedTextFallbackCount,
      "Retained mutated text did not rebuild exactly one retained text node")

    Require(TextTransportCell.Entry.Focus(),
      "Retained text entry did not focus")
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    focusedScene = WindowReadbackTestFixture.SceneRetention(opened)
    let focusedTextTotal = focusedScene.RetainedTextTotalCount
    -partialScene.RetainedTextTotalCount
    let focusedTextHits = focusedScene.RetainedTextHitCount
    -partialScene.RetainedTextHitCount
    Require(focusedTextTotal >= 3uL
        && focusedTextHits == focusedTextTotal - 1uL
        && focusedScene.RetainedTextFallbackCount
      == partialScene.RetainedTextFallbackCount + 1uL
        && focusedScene.RetainedTextInvalidationCount
      == partialScene.RetainedTextInvalidationCount + 1uL,
      "Focused text entry did not leave the retained snapshot path")

    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Retained text transport gate window did not close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("text-transport-smoke: segments=" + initialText.SegmentCount.ToString()
    +" records=" + initialText.RecordCount.ToString()
    +" bytes=" + initialText.ByteCount.ToString()
    +" warm_written=" + warmText.WrittenBytes.ToString()
    +" warm_skipped=" + warmText.SkippedBytes.ToString()
    +" warm_dirty=" + warmText.DirtySegmentCount.ToString()
    +" warm_ranges=" + warmText.UploadRangeCount.ToString()
    +" warm_mapped=" + warmText.MappedWrites.ToString()
    +" warm_flushes=" + warmText.Flushes.ToString()
    +" warm_reuse=" + warmText.RetainedReuse.ToString()
    +" partial_written=" + partialText.WrittenBytes.ToString()
    +" partial_dirty=" + partialText.DirtySegmentCount.ToString()
    +" partial_ranges=" + partialText.UploadRangeCount.ToString()
    +" partial_mapped=" + partialText.MappedWrites.ToString()
    +" analytic_records=" + initialPrimitive.RecordCount.ToString()
    +" batched_draws=" + batchedDraws.ToString()
    +" clip_bytes=" + initialClip.ByteCount.ToString()
    +" retained_text_hits=" + partialScene.RetainedTextHitCount.ToString()
    +" retained_text_rebuilds=" + partialScene.RetainedTextRebuildCount.ToString()
    +" retained_text_fallbacks=" + partialScene.RetainedTextFallbackCount.ToString()
    +" retained_text_invalidations="
    +partialScene.RetainedTextInvalidationCount.ToString()
    +" close=1")
}
