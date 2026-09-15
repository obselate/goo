package GooAsyncReadbackSmoke

import Goo
import System

data struct VirtualTableStop {
  internal var Name string
  internal var X float64
  internal var Y float64
}

func VirtualTableRequirePixelsEqual(first VulkanReadbackResult,
  second VulkanReadbackResult, stop string) {
    let firstPixels = first.Pixels
    let secondPixels = second.Pixels
    Require(first.Width == second.Width && first.Height == second.Height
        && firstPixels.Length == secondPixels.Length,
      "Retained StocksGrid readback extent differs at " + stop)
    var index int32 = 0
    while index < firstPixels.Length {
      if firstPixels[index] != secondPixels[index] {
        throw InvalidOperationException("Retained StocksGrid pixels differ at " + stop
          +" byte=" + index.ToString())
      }
      index = index + 1
    }
  }
func VirtualTableRequirePixelsDiffer(first VulkanReadbackResult,
  second VulkanReadbackResult, stop string) {
    let firstPixels = first.Pixels
    let secondPixels = second.Pixels
    Require(first.Width == second.Width && first.Height == second.Height
        && firstPixels.Length == secondPixels.Length,
      "Retained StocksGrid readback extent differs at " + stop)
    var index int32 = 0
    while index < firstPixels.Length {
      if firstPixels[index] != secondPixels[index] {
        return
      }
      index = index + 1
    }
    throw InvalidOperationException("Retained StocksGrid legacy and explicit pixels unexpectedly match at "
      +stop)
  }

func VirtualTableCompareStop(complete Window, virtualized Window,
  completeRoot VirtualTableRootCell, virtualRoot VirtualTableRootCell,
  stop VirtualTableStop) {
    completeRoot.ScrollTo(stop.X, stop.Y)
    virtualRoot.ScrollTo(stop.X, stop.Y)
    WindowReadbackTestFixture.ForceRender(complete, 0.0)
    WindowReadbackTestFixture.ForceRender(virtualized, 0.0)
    virtualRoot.AssertVirtualState()
    let completeResult = PrimitiveReadback(complete,
      WindowReadbackTestFixture.Metrics(complete))
    let virtualResult = PrimitiveReadback(virtualized,
      WindowReadbackTestFixture.Metrics(virtualized))
    VirtualTableRequirePixelsEqual(completeResult, virtualResult, stop.Name)
  }

func VirtualTableOpen(cullEnabled bool, root VirtualTableRootCell,
  title string) Window{
    let opened = Window{
      Title: title,
      Width: 1280,
      Height: 720,
      Background: Color.Rgb(13, 17, 23),
      Root: root,
      VSync: false,
    }
    opened.Open()
    WindowReadbackTestFixture.SetExactTextClipCull(opened, cullEnabled)
    WindowReadbackTestFixture.SetForceFullRedraw(opened, false)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    return opened
  }

func VirtualTableClose(window Window?) {
  if let active = window {
    if active.IsOpen {
      active.RequestClose()
      WindowReadbackTestFixture.ForceRender(active, 0.0)
    }
  }
}
func VirtualTableRunExplicitClipProof() {
  let legacySource = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let explicitSource = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let legacyRoot = VirtualTableRootCell(legacySource.Items,
    legacySource.Columns, legacySource.Rows, "complete", 1280.0, 720.0, 1, false)
  let explicitRoot = VirtualTableRootCell(explicitSource.Items,
    explicitSource.Columns, explicitSource.Rows, "complete", 1280.0, 720.0, 1, true)
  var legacyWindow Window? = nil
  var explicitWindow Window? = nil
  try {
    let openedLegacy = VirtualTableOpen(false, legacyRoot,
      "Goo Retained StocksGrid legacy clip")
    legacyWindow = openedLegacy
    let openedExplicit = VirtualTableOpen(false, explicitRoot,
      "Goo Retained StocksGrid explicit clip")
    explicitWindow = openedExplicit
    let legacyResult = PrimitiveReadback(openedLegacy,
      WindowReadbackTestFixture.Metrics(openedLegacy))
    let explicitResult = PrimitiveReadback(openedExplicit,
      WindowReadbackTestFixture.Metrics(openedExplicit))
    VirtualTableRequirePixelsDiffer(legacyResult, explicitResult,
      "explicit-clip-top-left")
  } finally {
    VirtualTableClose(legacyWindow)
    VirtualTableClose(explicitWindow)
  }
}

func VirtualTableRunMatrix(cullEnabled bool, stops []VirtualTableStop) {
  let completeSource = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let virtualSource = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let completeRoot = VirtualTableRootCell(completeSource.Items,
    completeSource.Columns, completeSource.Rows, "complete", 1280.0, 720.0, 1, true)
  let virtualRoot = VirtualTableRootCell(virtualSource.Items,
    virtualSource.Columns, virtualSource.Rows, "virtualized", 1280.0, 720.0, 1, true)
  var completeWindow Window? = nil
  var virtualWindow Window? = nil
  try {
    let openedComplete = VirtualTableOpen(cullEnabled, completeRoot,
      "Goo Retained StocksGrid complete")
    completeWindow = openedComplete
    let openedVirtual = VirtualTableOpen(cullEnabled, virtualRoot,
      "Goo Retained StocksGrid virtualized")
    virtualWindow = openedVirtual
    let complete = openedComplete
    let virtualized = openedVirtual
    Require(completeRoot.MountedCellCount == completeSource.TotalItems,
      "Retained complete StocksGrid did not mount all logical Cells")
    Require(virtualRoot.PoolRows == 43 && virtualRoot.PoolColumns == 23
        && virtualRoot.PoolCapacity == 989,
      "Retained virtual StocksGrid initial pool does not match the 1280x720 formula")
    Require(virtualRoot.MountedCellCount == virtualRoot.PoolCapacity
        && virtualRoot.PeakMountedCellCount == virtualRoot.PoolCapacity,
      "Retained virtual StocksGrid did not mount its fixed physical pool")
    virtualRoot.AssertVirtualState()
    var stopIndex int32 = 0
    while stopIndex < stops.Length {
      VirtualTableCompareStop(complete, virtualized, completeRoot, virtualRoot,
        stops[stopIndex])
      stopIndex = stopIndex + 1
    }
    completeRoot.ScrollTo(0.0, 0.0)
    virtualRoot.ScrollTo(0.0, 0.0)
    WindowReadbackTestFixture.ForceRender(complete, 0.0)
    WindowReadbackTestFixture.ForceRender(virtualized, 0.0)
    let staleSlot = virtualRoot.SlotForLogical(0)
    virtualRoot.ScrollTo(1600.0, 270.0)
    completeRoot.ScrollTo(1600.0, 270.0)
    WindowReadbackTestFixture.ForceRender(complete, 0.0)
    WindowReadbackTestFixture.ForceRender(virtualized, 0.0)
    let staleBefore = virtualRoot.StaleSlotRejectionCount
    let staleAccepted = virtualRoot.TryApplySlot(staleSlot, 0,
      virtualSource.Items[0])
    Require(!staleAccepted
        && virtualRoot.StaleSlotRejectionCount > staleBefore,
      "Retained virtual StocksGrid accepted a stale slot update")
    let buildBefore = virtualRoot.CellBuildCount
    let suppressedBefore = virtualRoot.OffscreenMutationSuppressionCount
    completeSource.MutateAt(completeRoot, 0)
    virtualSource.MutateAt(virtualRoot, 0)
    Require(virtualRoot.CellBuildCount == buildBefore
        && virtualRoot.OffscreenMutationSuppressionCount > suppressedBefore,
      "Retained virtual StocksGrid rebuilt an offscreen mutation")
    WindowReadbackTestFixture.ForceRender(complete, 0.0)
    WindowReadbackTestFixture.ForceRender(virtualized, 0.0)
    Require(virtualRoot.CellBuildCount == buildBefore,
      "Retained virtual StocksGrid built an offscreen mutation during render")
    let reveal = VirtualTableStop{Name: "mutated-reveal", X: 0.0, Y: 0.0}
    VirtualTableCompareStop(complete, virtualized, completeRoot, virtualRoot, reveal)
    let visibleBuildBefore = virtualRoot.CellBuildCount
    completeSource.MutateAt(completeRoot, 1)
    virtualSource.MutateAt(virtualRoot, 1)
    WindowReadbackTestFixture.ForceRender(complete, 0.0)
    WindowReadbackTestFixture.ForceRender(virtualized, 0.0)
    Require(virtualRoot.CellBuildCount == visibleBuildBefore + 1L
        && virtualRoot.VisibleMutationCount > 0L,
      "Retained virtual StocksGrid did not rebuild one mapped visible Cell")
    let visibleMutation = VirtualTableStop{
      Name: "visible-mutation", X: 0.0, Y: 0.0
    }
    VirtualTableCompareStop(complete, virtualized, completeRoot, virtualRoot,
      visibleMutation)
  } finally {
    VirtualTableClose(completeWindow)
    VirtualTableClose(virtualWindow)
  }
}

func VirtualTableRunZeroOverscan(stops []VirtualTableStop) {
  let completeSource = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let virtualSource = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let completeRoot = VirtualTableRootCell(completeSource.Items,
    completeSource.Columns, completeSource.Rows, "complete", 1280.0, 720.0, 0, true)
  let virtualRoot = VirtualTableRootCell(virtualSource.Items,
    virtualSource.Columns, virtualSource.Rows, "virtualized", 1280.0, 720.0, 0, true)
  var completeWindow Window? = nil
  var virtualWindow Window? = nil
  try {
    let openedComplete = VirtualTableOpen(true, completeRoot,
      "Goo Retained StocksGrid zero complete")
    completeWindow = openedComplete
    let openedVirtual = VirtualTableOpen(true, virtualRoot,
      "Goo Retained StocksGrid zero virtualized")
    virtualWindow = openedVirtual
    let complete = openedComplete
    let virtualized = openedVirtual
    Require(virtualRoot.PoolRows == 41 && virtualRoot.PoolColumns == 21
        && virtualRoot.PoolCapacity == 861,
      "Retained zero-overscan pool does not match the capacity formula")
    var stopIndex int32 = 0
    while stopIndex < stops.Length {
      VirtualTableCompareStop(complete, virtualized, completeRoot, virtualRoot,
        stops[stopIndex])
      stopIndex = stopIndex + 1
    }
  } finally {
    VirtualTableClose(completeWindow)
    VirtualTableClose(virtualWindow)
  }
}

func VirtualTableRunChurnCheck() {
  let sourceZero = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let sourceOne = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let zero = VirtualTableRootCell(sourceZero.Items, sourceZero.Columns,
    sourceZero.Rows, "virtualized", 1280.0, 720.0, 0, true)
  let one = VirtualTableRootCell(sourceOne.Items, sourceOne.Columns,
    sourceOne.Rows, "virtualized", 1280.0, 720.0, 1, true)
  let trace = [8]VirtualTableStop
  trace[0] = VirtualTableStop{Name: "a", X: 0.5, Y: 0.5}
  trace[1] = VirtualTableStop{Name: "b", X: 64.5, Y: 0.5}
  trace[2] = VirtualTableStop{Name: "c", X: 128.5, Y: 0.5}
  trace[3] = VirtualTableStop{Name: "d", X: 192.5, Y: 0.5}
  trace[4] = VirtualTableStop{Name: "e", X: 256.5, Y: 18.5}
  trace[5] = VirtualTableStop{Name: "f", X: 320.5, Y: 36.5}
  trace[6] = VirtualTableStop{Name: "g", X: 384.5, Y: 54.5}
  trace[7] = VirtualTableStop{Name: "h", X: 448.5, Y: 72.5}
  var index int32 = 0
  while index < trace.Length {
    zero.ScrollTo(trace[index].X, trace[index].Y)
    one.ScrollTo(trace[index].X, trace[index].Y)
    zero.AssertVirtualState()
    one.AssertVirtualState()
    index = index + 1
  }
  Require(one.SlotReassignmentCount < zero.SlotReassignmentCount,
    "Retained one-cell overscan did not reduce adjacent slot churn")
}

func VirtualTableRunResizeCheck() {
  let source = VirtualTableDataSource(VirtualTableDataSource.DefaultTotalItems)
  let root = VirtualTableRootCell(source.Items, source.Columns, source.Rows,
    "virtualized", 1280.0, 720.0, 1, true)
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo Retained StocksGrid resize",
      Width: 1280,
      Height: 720,
      Background: Color.Rgb(13, 17, 23),
      Root: root,
      VSync: false,
    }
    window = opened
    opened.Open()
    WindowReadbackTestFixture.SetExactTextClipCull(opened, true)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let initialCapacity = root.PoolCapacity
    let initialGrowth = root.PoolCapacityGrowthCount
    root.SetViewport(1400.0, 800.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let grownCapacity = root.PoolCapacity
    let grownGrowth = root.PoolCapacityGrowthCount
    Require(grownCapacity > initialCapacity && grownGrowth > initialGrowth
        && root.MountedCellCount == grownCapacity,
      "Retained viewport growth did not extend the physical pool")
    root.SetViewport(1400.0, 800.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(root.PoolCapacity == grownCapacity
        && root.PoolCapacityGrowthCount == grownGrowth
        && root.MountedCellCount == grownCapacity,
      "Retained repeated viewport dimensions grew or remounted the pool")
    root.SetViewport(1280.0, 720.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(root.PoolCapacity == grownCapacity
        && root.PoolCapacityGrowthCount == grownGrowth
        && root.MountedCellCount == grownCapacity,
      "Retained smaller viewport discarded the retained physical pool")
  } finally {
    VirtualTableClose(window)
  }
}

func RunVirtualTableSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let stops = [9]VirtualTableStop
  stops[0] = VirtualTableStop{Name: "top-left", X: 0.0, Y: 0.0}
  stops[1] = VirtualTableStop{Name: "fractional", X: 0.5, Y: 0.5}
  stops[2] = VirtualTableStop{Name: "one-cell", X: 64.0, Y: 18.0}
  stops[3] = VirtualTableStop{Name: "diagonal", X: 76.5, Y: 25.25}
  stops[4] = VirtualTableStop{Name: "boundary-a", X: 128.0, Y: 36.0}
  stops[5] = VirtualTableStop{Name: "boundary-a-repeat", X: 128.0, Y: 36.0}
  stops[6] = VirtualTableStop{Name: "middle", X: 1600.0, Y: 270.0}
  stops[7] = VirtualTableStop{Name: "bottom-right", X: 3200.0, Y: 540.0}
  stops[8] = VirtualTableStop{Name: "return", X: 0.0, Y: 0.0}
  VirtualTableRunExplicitClipProof()
  VirtualTableRunMatrix(false, stops)
  VirtualTableRunMatrix(true, stops)
  let zeroStops = [3]VirtualTableStop
  zeroStops[0] = VirtualTableStop{Name: "zero-middle", X: 1600.0, Y: 270.0}
  zeroStops[1] = VirtualTableStop{Name: "zero-bottom-right", X: 3200.0, Y: 540.0}
  zeroStops[2] = VirtualTableStop{Name: "zero-return", X: 0.0, Y: 0.0}
  VirtualTableRunZeroOverscan(zeroStops)
  VirtualTableRunChurnCheck()
  VirtualTableRunResizeCheck()
  Console.WriteLine("virtual-table-smoke: cull_modes=2 stops=9"
    +" explicit_clip=1 complete=4900 virtual_pool=989 zero_overscan=1"
    +" mutation=1 stale_slot=1 uniqueness=1 churn=1 resize=1 close=1")
}
