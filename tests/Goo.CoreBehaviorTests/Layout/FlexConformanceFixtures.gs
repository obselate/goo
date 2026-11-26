package Goo

import System
import System.Collections.Generic
import System.Globalization
import System.Text.Json

internal class FlexConformanceFixtures {
    func RowColumnSpacerContract() bool {
        let blobs = []Blob{Row{}, Column{}, Row{HitTestSelf: true}, Column{HitTestSelf: true},
            Row{HitTestSelf: false, OnClick: () -> {}}, Column{HitTestSelf: false, OnClick: () -> {}},
            Row{OnClick: () -> {}}, Column{OnClick: () -> {}}}
        for index in 0 ... blobs.Length {
            let node = Reconciler{Res: Resolver{}}.Mount(blobs[index])
            try {
                Layout().Calculate(node, 100.0F, 40.0F)
                let expected = index == 2 || index == 3 || index >= 6
                if node.HitTestSelf != expected { return false }
            } finally { NodeLifecycle.DisposeTree(node) }
        }
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
    func Run(table JsonElement, failures List[string], output Action[string], useManaged bool) int32 {
        let engine = FlexLayoutEngine()
        let policies = table.GetProperty("gooAutomaticMinimum")
        let useGooMinimum = useManaged && !FlexLayoutEngine.UsesChromiumAutomaticMinimum
        var policyMatches = 0
        var chromiumMatches = 0
        var count = 0
        for test in table.GetProperty("cases").EnumerateArray() {
            let name = test.GetProperty("name").GetString()!!
            let root = Reconciler{Res: Resolver{}}.Mount(Build(test.GetProperty("tree")))
            try {
                let viewport = test.GetProperty("viewport")
                let actual = List[[]float32]()
                if useManaged {
                    let width = viewport[0].GetSingle()
                    let height = viewport[1].GetSingle()
                    engine.ArrangeSubtree(root, FlexRequest{Width: FlexConstraint.Cap(width),
                        Height: FlexConstraint.Cap(height), OwnerWidth: width, OwnerHeight: height, Root: true})
                    CollectRaw(root, actual, 0.0F, 0.0F)
                } else {
                    Layout().Calculate(root, viewport[0].GetSingle(), viewport[1].GetSingle())
                    Collect(root, actual)
                }
                let reference = test.GetProperty("boxes")
                let hasDeviation = test.TryGetProperty("deviation", out var deviation)
                let hasControl = policies.TryGetProperty(name, out var control)
                let expected = if !useManaged && hasDeviation {
                    deviation.GetProperty("boxes")
                } else if useGooMinimum && hasControl {
                    control.GetProperty("boxes")
                } else {
                    reference
                }
                let tolerance = if test.TryGetProperty("tolerance", out var value) {
                    value.GetSingle()
                } else {
                    0.0F
                }
                let matches = Matches(actual, expected, tolerance)
                if useManaged && Matches(actual, reference, tolerance) { chromiumMatches++ }
                if matches && useGooMinimum && hasControl { policyMatches++ }
                if !matches {
                    failures.Add(
                        "$name Chromium=${JsonSerializer.Serialize(reference)} Expected=${JsonSerializer.Serialize(expected)} Goo=${JsonSerializer.Serialize(actual)}"
                    )
                } else if useGooMinimum && hasControl {
                    output("$name Chromium=${JsonSerializer.Serialize(reference)} Expected=${JsonSerializer.Serialize(expected)} Goo=${JsonSerializer.Serialize(actual)}")
                } else if name.StartsWith("font-width-", StringComparison.Ordinal) {
                    output("$name Chromium=${JsonSerializer.Serialize(reference)} Goo=${JsonSerializer.Serialize(actual)}")
                }
                count++
            } finally {
                NodeLifecycle.DisposeTree(root)
            }
        }
        if useManaged {
            output("$chromiumMatches/$count unmodified Chromium cases matched; $policyMatches strict Chromium policy controls matched")
        }
        return count
    }

    private func Matches(actual List[[]float32], expected JsonElement, tolerance float32) bool {
        if actual.Count != expected.GetArrayLength() { return false }
        for i in 0 ... actual.Count {
            for axis in 0 ... 4 {
                let coordinate = actual[i][axis]
                if !Single.IsFinite(coordinate) || MathF.Abs(coordinate - expected[i][axis].GetSingle()) > tolerance {
                    return false
                }
            }
        }
        return true
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
                if value.ValueKind != JsonValueKind.Object {
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

    private func ReadLength(value JsonElement) Length {
        if value.ValueKind == JsonValueKind.Number { return value.GetDouble() }
        let text = value.GetString() ?? throw InvalidOperationException("Expected an auto or percentage length")
        if text == "auto" { return Length.Auto }
        return Percent(Double.Parse(text.TrimEnd('%'), CultureInfo.InvariantCulture))
    }

    private func Collect(node Node, boxes List[[]float32]) {
        boxes.Add([]float32{node.Rect.X, node.Rect.Y, node.Rect.W, node.Rect.H})
        for child in node.Children {
            Collect(child, boxes)
        }
    }

    private func CollectRaw(node Node, boxes List[[]float32], x float32, y float32) {
        let raw = node.LogicalLayout.Raw
        let left = node.LogicalLayout.Valid ? x + raw.X : 0.0F
        let top = node.LogicalLayout.Valid ? y + raw.Y : 0.0F
        boxes.Add([]float32{left, top, raw.W, raw.H})
        for index in 0 ... node.Children.Count {
            CollectRaw(node.Children[index], boxes, left, top)
        }
    }
}
