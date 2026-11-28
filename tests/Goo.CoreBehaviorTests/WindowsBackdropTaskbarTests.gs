import Goo
import Xunit

class WindowsBackdropTaskbarTests {
    @Fact
    func ComputeMaximizedWorkRectLeavesNormalDockedTaskbarUnchanged() {
        let monitor = WindowsRect(0, 0, 1920, 1080)
        let work = WindowsRect(0, 0, 1920, 1032)

        let actual = WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 0u)

        Assert.Equal(work, actual)
    }

    @Fact
    func ComputeMaximizedWorkRectInsetsMatchingAutoHideBottomEdge() {
        let monitor = WindowsRect(0, 0, 1920, 1080)
        let work = WindowsRect(0, 0, 1920, 1080)

        let actual = WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 8u)

        Assert.Equal(WindowsRect(0, 0, 1920, 1079), actual)
    }

    @Fact
    func ComputeMaximizedWorkRectInsetsMatchingAutoHideTopEdge() {
        let monitor = WindowsRect(0, 0, 1920, 1080)
        let work = WindowsRect(0, 0, 1920, 1080)

        let actual = WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 2u)

        Assert.Equal(WindowsRect(0, 1, 1920, 1080), actual)
    }

    @Fact
    func ComputeMaximizedWorkRectInsetsMatchingAutoHideLeftEdge() {
        let monitor = WindowsRect(0, 0, 1920, 1080)
        let work = WindowsRect(0, 0, 1920, 1080)

        let actual = WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 1u)

        Assert.Equal(WindowsRect(1, 0, 1920, 1080), actual)
    }

    @Fact
    func ComputeMaximizedWorkRectInsetsMatchingAutoHideRightEdge() {
        let monitor = WindowsRect(0, 0, 1920, 1080)
        let work = WindowsRect(0, 0, 1920, 1080)

        let actual = WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 4u)

        Assert.Equal(WindowsRect(0, 0, 1919, 1080), actual)
    }

    @Fact
    func ComputeMaximizedWorkRectSkipsNonMatchingEdgesAndInsetsMatchingEdges() {
        let monitor = WindowsRect(0, 0, 1920, 1080)
        let work = WindowsRect(0, 0, 1920, 1032)

        let bottomOnly = WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 8u)
        let leftAndBottom = WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 1u | 8u)

        Assert.Equal(work, bottomOnly)
        Assert.Equal(WindowsRect(1, 0, 1920, 1032), leftAndBottom)
    }

    @Fact
    func ComputeMaximizedWorkRectHandlesMultiMonitorNegativeCoordinates() {
        let monitor = WindowsRect(-2560, -360, 0, 1080)
        let work = WindowsRect(-2560, -360, 0, 1080)

        Assert.Equal(WindowsRect(-2559, -360, 0, 1080), WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 1u))
        Assert.Equal(WindowsRect(-2560, -359, 0, 1080), WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 2u))
        Assert.Equal(WindowsRect(-2560, -360, -1, 1080), WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 4u))
        Assert.Equal(WindowsRect(-2560, -360, 0, 1079), WindowsBackdrop.ComputeMaximizedWorkRect(monitor, work, 8u))

        let dockedLeft = WindowsRect(-2512, -360, 0, 1080)
        Assert.Equal(
            WindowsRect(-2512, -360, 0, 1079),
            WindowsBackdrop.ComputeMaximizedWorkRect(monitor, dockedLeft, 1u | 8u)
        )
    }

    @Fact
    func ComputeNormalTopResizeHitDetectsTopEdgeAndCornersWithinVisibleBounds() {
        let winRect = WindowsRect(100, 200, 2494, 1780)
        let sideInset = 17
        let topBand = 10
        let cornerWidth = 32

        Assert.Equal(nint(13), WindowsBackdrop.ComputeNormalTopResizeHit(winRect, sideInset, topBand, cornerWidth, 120, 200))
        Assert.Equal(nint(12), WindowsBackdrop.ComputeNormalTopResizeHit(winRect, sideInset, topBand, cornerWidth, 500, 205))
        Assert.Equal(nint(14), WindowsBackdrop.ComputeNormalTopResizeHit(winRect, sideInset, topBand, cornerWidth, 2460, 209))
        Assert.Equal(nint(0), WindowsBackdrop.ComputeNormalTopResizeHit(winRect, sideInset, topBand, cornerWidth, 500, 210))
        Assert.Equal(nint(0), WindowsBackdrop.ComputeNormalTopResizeHit(winRect, sideInset, topBand, cornerWidth, 105, 202))
        Assert.Equal(nint(0), WindowsBackdrop.ComputeNormalTopResizeHit(winRect, sideInset, topBand, cornerWidth, 2490, 202))
    }
}
