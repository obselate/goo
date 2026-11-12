package Goo

import System
import System.Collections.Generic
import System.Globalization
import System.Text.Json

internal class FlexConformanceFixtures {
    func RowColumnSpacerContract() bool {
        var clicks = 0
        let reconciler = Reconciler{Res: Resolver{}}
        let root = reconciler.Mount(Row{
            Width: 100, Height: 40,
            Container{Key: "first", Width: 10, Height: 10},
            Spacer{Key: "space", BackgroundColor: Color.White, Focusable: true,
                AccessibilityName: "excluded", OnClick: () -> { clicks++ }},
            Container{Key: "last", Width: 20, Height: 10},
        })
        try {
            Layout().Calculate(root, 100.0F, 40.0F)
            let spacer = root.Children[1]
            if root.FlexDirection != FlexDirection.Row || spacer.Rect.W != 70.0F
                || root.Children[2].Rect.X != 80.0F || !spacer.PaintInputHidden
                || spacer.Focusable || spacer.HitTestSelf || hitActivate(root, spacer) { return false }
            if clicks != 0 { return false }
            let manager = AccessibilityManager(Window{})
            manager.CaptureForDiagnostics(root)
            if manager.DiagnosticNodeFor(spacer) != nil { return false }
            let retained = reconciler.Diff(root, Row{Width: 100, Height: 40,
                Container{Key: "last", Width: 20, Height: 10}, Spacer{Key: "space"},
                Container{Key: "first", Width: 10, Height: 10}})
            if retained != root || retained.Children[1] != spacer { return false }
            let column = reconciler.Diff(root, Column{Width: 100, Height: 40,
                Container{Height: 10}, Spacer(), Container{Height: 10}})
            Layout().Calculate(column, 100.0F, 40.0F)
            let valid = column == root && column.FlexDirection == FlexDirection.Column
                && column.Children[1].Rect.H == 20.0F && column.Children[2].Rect.Y == 30.0F
            return valid
        } finally { NodeLifecycle.DisposeTree(root) }
    }

    func KeyedFlexKindChangeContract() bool {
        let reconciler = Reconciler{Res: Resolver{}}
        let root = reconciler.Mount(Container(){Row{Key: "layout", Width: 100, Height: 40,
            Container{Width: 10, Height: 10}, Container{Width: 10, Height: 10}}})
        try {
            let child = root.Children[0]
            reconciler.Diff(root, Container(){Column{Key: "layout", Width: 100, Height: 40,
                Container{Width: 10, Height: 10}, Container{Width: 10, Height: 10}}})
            Layout().Calculate(root, 100.0F, 40.0F)
            if root.Children[0] != child || child.Children[1].Rect.Y != 10.0F { return false }
            reconciler.Diff(root, Container(){Container{Key: "layout", Width: 100, Height: 40,
                FlexDirection: FlexDirection.Row,
                Container{Width: 10, Height: 10}, Container{Width: 10, Height: 10}}})
            Layout().Calculate(root, 100.0F, 40.0F)
            return root.Children[0] == child && child.Children[1].Rect.X == 10.0F
                && child.Children[1].Rect.Y == 0.0F
        } finally { NodeLifecycle.DisposeTree(root) }
    }

    func FixedFlexDirectionContract() bool {
        let blobs = []Blob{
            Row{FlexDirection: FlexDirection.Row},
            Column{BasedOn: Style{FlexDirection: FlexDirection.Column}},
            Row{HoverStyle: Style{FlexDirection: FlexDirection.Column}},
        }
        for blob in blobs {
            var rejected = false
            try { Reconciler{Res: Resolver{}}.Mount(blob) }
            catch (_ InvalidOperationException) { rejected = true }
            if !rejected { return false }
        }
        return true
    }
    func Run(table JsonElement, failures List[string], output Action[string]) int32 {
        var count = 0
        for test in table.GetProperty("cases").EnumerateArray() {
            let name = test.GetProperty("name").GetString()!!
            let root = Reconciler{Res: Resolver{}}.Mount(Build(test.GetProperty("tree")))
            try {
                let viewport = test.GetProperty("viewport")
                Layout().Calculate(root, viewport[0].GetSingle(), viewport[1].GetSingle())
                let actual = List[[]float32]()
                Collect(root, actual)
                let reference = test.GetProperty("boxes")
                let expected = if test.TryGetProperty("deviation", out var deviation) {
                    deviation.GetProperty("boxes")
                } else {
                    reference
                }
                let tolerance = if test.TryGetProperty("tolerance", out var value) {
                    value.GetSingle()
                } else {
                    0.0F
                }
                var matches = actual.Count == expected.GetArrayLength()
                for i in 0 ... Math.Min(actual.Count, expected.GetArrayLength()) {
                    for axis in 0 ... 4 {
                        if !Single.IsFinite(actual[i][axis]) || MathF.Abs(
                            actual[i][axis] - expected[i][axis].GetSingle()
                        ) > tolerance {
                            matches = false
                        }
                    }
                }
                if !matches || name.StartsWith("font-width-", StringComparison.Ordinal) {
                    let boxes = JsonSerializer.Serialize(actual)
                    if matches {
                        output("$name Chromium=${JsonSerializer.Serialize(reference)} Goo=$boxes")
                    } else {
                        failures.Add(
                            "$name Chromium=${JsonSerializer.Serialize(reference)} Expected=${JsonSerializer.Serialize(expected)} Goo=$boxes"
                        )
                    }
                }
                count++
            } finally {
                NodeLifecycle.DisposeTree(root)
            }
        }
        return count
    }

    private func Build(spec JsonElement) Blob {
        let blob = if spec.TryGetProperty("text", out var text) {
            cast[Blob](Text{Content: text.GetString()!!, FontWeight: 400})
        } else {
            cast[Blob](Container())
        }
        for entry in spec.GetProperty("style").EnumerateObject() {
            let property = typeof(Style).GetProperty(entry.Name) ??
                throw InvalidOperationException("Unknown style ${entry.Name}")
            let type = property.PropertyType
            let value = entry.Value
            let converted object = if type == typeof(Length) {
                cast[object](ReadLength(value))
            } else if type == typeof(Edges) {
                if value.ValueKind == JsonValueKind.Number {
                    cast[object](Edges(ReadLength(value)))
                } else {
                    cast[object](
                        Edges{
                            Left: Edge(value, "Left"),
                            Right: Edge(value, "Right"),
                            Top: Edge(value, "Top"),
                            Bottom: Edge(value, "Bottom")
                        }
                    )
                }
            } else if type.IsEnum {
                Enum.Parse(type, value.GetString()!!)
            } else if type == typeof(string) {
                cast[object](value.GetString()!!)
            } else if type == typeof(float64) {
                cast[object](value.GetDouble())
            } else {
                throw InvalidOperationException("Unsupported style ${entry.Name}: $type")
            }
            property.SetValue(blob, converted)
        }
        if blob is Container {
            if spec.TryGetProperty("children", out var children) {
                for child in children.EnumerateArray() {
                    blob.Children.Add(Build(child))
                }
            }
        }
        return blob
    }

    private func Edge(value JsonElement, name string) Length ->
    if value.TryGetProperty(name, out var edge) {
        ReadLength(edge)
    } else {
        0
    }

    private func ReadLength(value JsonElement) Length -> if value.ValueKind == JsonValueKind.Number {
        value.GetDouble()
    } else {
        Percent(Double.Parse(value.GetString()!!.TrimEnd('%'), CultureInfo.InvariantCulture))
    }

    private func Collect(node Node, boxes List[[]float32]) {
        boxes.Add([]float32{node.Rect.X, node.Rect.Y, node.Rect.W, node.Rect.H})
        for child in node.Children {
            Collect(child, boxes)
        }
    }
}
