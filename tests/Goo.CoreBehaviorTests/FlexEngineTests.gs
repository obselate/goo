import Goo
import Xunit

class FlexEngineTests {
    @Fact
    func MeasurementCacheSeparatesOwnerModeAndCommit() {
        let root = Reconciler{Res: Resolver{}}.Mount(Text{Padding: Edges{Left: Percent(10)}})
        try {
            var calls = 0
            let engine = FlexLayoutEngine{
                MeasureContent: (_, _, _) -> {
                    calls++
                    return FlexSize{Width: 20.0F, Height: 10.0F}
                }
            }
            var key = FlexRequest{Width: FlexConstraint.Cap(100.0F), OwnerWidth: 100.0F}
            Assert.Equal(30.0F, engine.MeasureSubtree(root, key).Width)
            Assert.Equal(30.0F, engine.MeasureSubtree(root, key).Width)
            Assert.Equal(1, calls)
            Assert.False(root.LogicalLayout.Valid)
            key.OwnerWidth = 200.0F
            Assert.Equal(40.0F, engine.MeasureSubtree(root, key).Width)
            for index in 3 ... 6 {
                key.OwnerWidth = float32(index * 100)
                engine.MeasureSubtree(root, key)
            }
            Assert.Equal(4, root.FlexMeasures.Count)
            key.OwnerWidth = 100.0F
            Assert.Equal(30.0F, engine.MeasureSubtree(root, key).Width)
            Assert.Equal(6, calls)
            key.Width = FlexConstraint.Exact(100.0F)
            engine.ArrangeSubtree(root, key)
            Assert.Equal(100.0F, root.LogicalLayout.Raw.W)
            Assert.Equal(7, calls)
            engine.ArrangeSubtree(root, key)
            Assert.Equal(7, calls)
            FlexLayoutEngine.Invalidate(root)
            engine.MeasureSubtree(root, key)
            Assert.False(root.FlexMeasures.HasCommitted)
            Assert.Equal(8, calls)
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }

    @Fact
    func ReversedAxesKeepPhysicalInsetSigns() {
        let root = Reconciler{Res: Resolver{}}.Mount(
            Container{
                Width: 80,
                Height: 60,
                FlexDirection: FlexDirection.RowReverse,
                FlexWrap: FlexWrap.WrapReverse,
                Direction: Direction.RightToLeft,
                Container{Width: 30, Height: 10, Left: 7, Top: 3}
            }
        )
        try {
            FlexLayoutEngine().ArrangeSubtree(root, FlexRequest{Root: true})
            let child = root.Children[0]
            Assert.Equal(Direction.RightToLeft, child.LogicalLayout.Direction)
            Assert.Equal(7.0F, child.LogicalLayout.Raw.X)
            Assert.Equal(53.0F, child.LogicalLayout.Raw.Y)
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }

    @Fact
    func FractionalGrowKeepsUndistributedSpaceAfterFreeze() {
        let root = Reconciler{Res: Resolver{}}.Mount(
            Row{
                Width: 200,
                Height: 20,
                JustifyContent: JustifyContent.FlexEnd,
                Container{FlexBasis: 50, FlexGrow: 0.25, MaxWidth: 60},
                Container{FlexBasis: 50, FlexGrow: 0.25}
            }
        )
        try {
            FlexLayoutEngine().ArrangeSubtree(root, FlexRequest{Root: true})
            Assert.Equal(65.0F, root.Children[0].LogicalLayout.Raw.X)
            Assert.Equal(60.0F, root.Children[0].LogicalLayout.Raw.W)
            Assert.Equal(125.0F, root.Children[1].LogicalLayout.Raw.X)
            Assert.Equal(75.0F, root.Children[1].LogicalLayout.Raw.W)
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }

    @Fact
    func RawGridUsesAbsoluteOriginsAndMeasuredSizeCeiling() {
        let root = Reconciler{Res: Resolver{}}.Mount(
            Container{
                Width: 10,
                Height: 10,
                Container{Width: 0.2, Height: 0.2, Left: 0.6, Position: PositionType.Absolute},
                Text{Width: 0.2, Height: 0.2, Left: 0.6, Position: PositionType.Absolute}
            }
        )
        try {
            let engine = FlexLayoutEngine()
            let key = FlexRequest{Root: true, Density: 2.0F}
            engine.ArrangeSubtree(root, key, -0.21F)
            let box = root.Children[0]
            let text = root.Children[1]
            Assert.Equal(0.6F, box.LogicalLayout.Raw.X)
            Assert.Equal(0.2F, box.LogicalLayout.Raw.W)
            Assert.Equal(0.5F, box.LogicalLayout.Snapped.X)
            Assert.Equal(0.5F, box.LogicalLayout.Snapped.W)
            Assert.Equal(0.0F, text.LogicalLayout.Snapped.X)
            Assert.Equal(0.5F, text.LogicalLayout.Snapped.W)
            engine.ArrangeSubtree(root, key, 0.2F)
            Assert.Equal(1.0F, box.LogicalLayout.Snapped.X)
            Assert.Equal(0.5F, text.LogicalLayout.Snapped.X)
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }
}
