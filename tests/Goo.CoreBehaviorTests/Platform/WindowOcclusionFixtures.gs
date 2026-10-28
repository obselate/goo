package Goo

import System
import System.Collections.Generic
import System.Threading

internal partial class EmbeddedWindowBridge {
  internal func ReportOcclusionForTest(value WindowOcclusion) { OcclusionChanged?.Invoke(value) }
}

internal class WindowOcclusionFixtures {
  func HostTransitionsNotifyOnUiThread() bool {
    using let host = ElementHandleEmbeddedHost()
    let window = Window{}
    if window.Occlusion != WindowOcclusion.Unknown
      || window.RenderingDevice.Kind != RenderingDeviceKind.Unknown || window.RenderingDevice.Name != "" { return false }
    window.Attach(host)
    try {
      let ownerThread = Environment.CurrentManagedThreadId
      let states = List[WindowOcclusion]()
      var correctThread = true
      let callback Action[WindowOcclusion] = value -> {
        correctThread = correctThread && Environment.CurrentManagedThreadId == ownerThread
          && window.Occlusion == value
        states.Add(value)
      }
      window.OcclusionChanged += callback
      let bridge = host.Bridge!!
      let visible = window.IsVisible
      window.Post(() -> {
        bridge.ReportOcclusionForTest(WindowOcclusion.Unoccluded)
        bridge.ReportOcclusionForTest(WindowOcclusion.Unoccluded)
        bridge.ReportOcclusionForTest(WindowOcclusion.Occluded)
        bridge.ReportOcclusionForTest(WindowOcclusion.Occluded)
        bridge.ReportOcclusionForTest(WindowOcclusion.Unoccluded)
        bridge.ReportOcclusionForTest(WindowOcclusion.Unknown)
      })
      host.RenderFrame(0.0)
      if !correctThread || states.Count != 4 || states[0] != WindowOcclusion.Unoccluded
        || states[1] != WindowOcclusion.Occluded || states[2] != WindowOcclusion.Unoccluded
        || states[3] != WindowOcclusion.Unknown || window.IsVisible != visible { return false }
      var rejected = false
      let thread = Thread(() -> {
        try { bridge.ReportOcclusionForTest(WindowOcclusion.Occluded) }
        catch (_ InvalidOperationException) { rejected = true }
      })
      thread.Start()
      thread.Join()
      if !rejected || states.Count != 4 || window.Occlusion != WindowOcclusion.Unknown { return false }
      window.OcclusionChanged -= callback
      bridge.ReportOcclusionForTest(WindowOcclusion.Occluded)
      if states.Count != 4 || window.Occlusion != WindowOcclusion.Occluded { return false }
      window.Close()
      return window.Occlusion == WindowOcclusion.Unknown
        && window.RenderingDevice.Kind == RenderingDeviceKind.Unknown && window.RenderingDevice.Name == ""
    } finally { window.Close() }
  }
}
