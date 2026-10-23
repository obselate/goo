package Goo

import System
import System.Diagnostics
import System.Threading

internal class PopupSmokeCell : Cell {
  internal var Host Window?

  override func Build() Blob {
    Host = ContextEnvironment.OwnedWindow()
    return Container{ Width: Percent(100), Height: Percent(100), BackgroundColor: Color.Rgb(40, 160, 80) }
  }
}

public sealed partial class PopupWindow {
  internal prop HostedWindowForTest Window { get -> window }
}

internal class PopupWindowSmoke {
  shared {
    private func Require(value bool, message string) {
      if !value { throw InvalidOperationException(message) }
    }

    private func PumpUntil(owner Window, popup PopupWindow?, condition Func[bool], child PopupWindow? = nil) {
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 15
      while !condition() && Stopwatch.GetTimestamp() < deadline {
        SdlRuntime.PumpEvents(64)
        owner.PumpScheduled(0.0)
        popup?.HostedWindowForTest.PumpScheduled(0.0)
        child?.HostedWindowForTest.PumpScheduled(0.0)
        Thread.Sleep(1)
      }
      Require(condition(), "Native popup lifecycle did not settle")
    }

    internal func Run() {
      let ownerRoot = PopupSmokeCell{}
      let owner = Window{ Title: "Goo native popup smoke", Root: ownerRoot, Width: 320, Height: 200, UiScale: 1.5F }.Open()
      let root = PopupSmokeCell{}
      using let popup = PopupWindow(owner, root, PopupKind.Tooltip)
      var dismissed = 0
      var dismissReason = PopupDismissReason.Programmatic
      popup.Dismissed += reason -> {
        dismissed++
        dismissReason = reason
      }
      try {
        PumpUntil(owner, nil, () -> owner.IsVisible)
        WindowReadbackTestFixture.ForceRender(owner, 0.0, 15.0)
        using let noInput = PopupWindow(owner, PopupSmokeCell{})
        if SdlHost.IsWayland() {
          let denied = noInput.Open(ElementRect{ X: 20.0, Y: 20.0, Width: 20.0, Height: 20.0 }, 100, 80)
          Require(denied.Status == PopupStatus.RequiresUserAction && !noInput.IsOpen,
            "Wayland menu without native input did not return RequiresUserAction")
        }
        let result = popup.Open(ElementRect{ X: 190.0, Y: 110.0, Width: 20.0, Height: 20.0 }, 100, 80)
        Require(result.Status == PopupStatus.Opened, "Tooltip open failed: " + result.Error)
        PumpUntil(owner, popup, () -> root.Host?.IsVisible == true)
        WindowReadbackTestFixture.ForceRender(root.Host!!, 0.0, 15.0)
        Require(popup.Metrics.LogicalWidth == 150 && popup.Metrics.LogicalHeight == 120
          && popup.Metrics.FramebufferWidth > 0, "Native popup did not apply the owner's UI scale")
        let update = popup.UpdatePlacement(ElementRect{ X: 10.0, Y: 10.0, Width: 20.0, Height: 20.0 }, 120, 90)
        Require(update == WindowOperationResult.Accepted, "Native popup reposition failed")
        WindowReadbackTestFixture.ForceRender(root.Host!!, 0.0, 15.0)
        let childRoot = PopupSmokeCell{}
        using let child = PopupWindow(popup, childRoot, PopupKind.Tooltip)
        let nested = child.Open(ElementRect{ X: 20.0, Y: 20.0, Width: 10.0, Height: 10.0 }, 60, 40,
          PortalPlacement.RightStart)
        Require(nested.Status == PopupStatus.Opened, "Nested tooltip open failed: " + nested.Error)
        PumpUntil(owner, popup, () -> childRoot.Host?.IsVisible == true, child)
        WindowReadbackTestFixture.ForceRender(childRoot.Host!!, 0.0, 15.0)
        Require(owner.Hide() == WindowOperationResult.Accepted, "Owner hide failed")
        PumpUntil(owner, popup, () -> !popup.IsOpen && !child.IsOpen, child)
        Require(dismissed == 1 && dismissReason == PopupDismissReason.OwnerHidden,
          "Owner hide did not deliver one tooltip dismissal after retirement")
        Require(owner.Show() == WindowOperationResult.Accepted, "Owner restore failed")
        WindowReadbackTestFixture.ForceRender(owner, 0.0, 15.0)
        let modalRoot = PopupSmokeCell{}
        using let modalPopup = PopupWindow(owner, modalRoot, PopupKind.Tooltip)
        Require(modalPopup.Open(ElementRect{ X: 10.0, Y: 10.0, Width: 20.0, Height: 20.0 }, 80, 60).Status
          == PopupStatus.Opened, "Modal ordering tooltip did not open")
        PumpUntil(owner, modalPopup, () -> modalRoot.Host?.IsVisible == true)
        WindowReadbackTestFixture.ForceRender(modalRoot.Host!!, 0.0, 15.0)
        var modalStatus NativeModalStatus
        let busy = owner.BeginNativeModal(&modalStatus)
        Require(busy == nil && modalStatus == NativeModalStatus.Busy,
          "Native modal acceptance overtook popup retirement")
        PumpUntil(owner, modalPopup, () -> !modalPopup.IsOpen)
        using let accepted = owner.BeginNativeModal(&modalStatus)
          ?? throw InvalidOperationException("Native modal lease stayed busy after popup retirement")
        Require(modalStatus == NativeModalStatus.Accepted, "Native modal acceptance returned the wrong status")
        accepted.Dispose()
        owner.RequestClose()
        PumpUntil(owner, popup, () -> !owner.IsOpen)
      } finally {
        popup.Close()
        owner.RequestClose()
        PumpUntil(owner, popup, () -> !owner.IsOpen && !popup.IsOpen)
      }
      Console.WriteLine("native-popup: tooltip_render=passed missing_grab=passed scale=passed reposition=passed owner_hide=passed modal_order=passed teardown=passed")
    }
  }
}
