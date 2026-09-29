package Goo

import System

internal class TextPresentationLayerFixtures {
  func BulkStyleReplacementIsAtomicAndPreservesProjections() bool {
    let document = TextDocument("alpha beta")
    using let layer = TextPresentationLayer(document)
    layer.SetStyle("old", TextRange(0, 5), Style{ Color: Color.Parse("#ff0000") })
    layer.SetReplacement("projection", TextRange(6, 4), "B")
    let first = TextStyleSpan("first", TextRange(0, 5), Style{ Color: Color.Parse("#00ff00") })
    let second = TextStyleSpan("second", TextRange(6, 4), Style{ Color: Color.Parse("#0000ff") })
    let before = layer.Revision
    layer.ReplaceStyles([]TextStyleSpan{ first, second })
    if layer.Revision != before + 1 || layer.ReadStyleSpans().Length != 2
      || layer.ReadStyleSpans()[0].Key != "first" || layer.ReadProjections().Length != 1 {
      return false
    }
    let replaced = layer.Revision
    try {
      layer.ReplaceStyles([]TextStyleSpan{ first, second with{Key = "first"} })
      return false
    } catch (ArgumentException) { }
    try {
      layer.ReplaceStyles([]TextStyleSpan{ first, second with{Range = TextRange(99, 1)} })
      return false
    } catch (ArgumentOutOfRangeException) { }
    if layer.Revision != replaced || layer.ReadStyleSpans().Length != 2
      || layer.ReadStyleSpans()[1].Range != second.Range || layer.ReadProjections().Length != 1 {
      return false
    }
    document.Apply(TextChange(TextRange(0, 1), ""))
    if layer.ReadStyleSpans()[1].Range.Start != 5 { return false }
    document.Undo()
    if layer.ReadStyleSpans()[1].Range != second.Range { return false }
    layer.ReplaceStyles([]TextStyleSpan{})
    return layer.ReadStyleSpans().Length == 0 && layer.ReadProjections().Length == 1
  }
}
