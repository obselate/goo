package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Threading

internal class LayerStillImageSmoke {
  shared {
    @DllImport("libc", EntryPoint: "fcntl")
    private func DescriptorFlags(fd int32, command int32) int32;

    internal func Run() {
      let path = Path.Combine(AppContext.BaseDirectory, "local-rgba.png")
      let sharedImage = LayerWindowImage(path, ImageFit.Cover)
      let alternate = LayerWindowImage(path, ImageFit.Contain)
      let first = Open(sharedImage, 251, 143)
      let second = Open(sharedImage, 137, 253)
      try {
        Wait(first, second, () -> first.IsVisible && second.IsVisible)
        let direct = first.SdlHostForTest()!!.PresentsStillImage
        Require(direct == second.SdlHostForTest()!!.PresentsStillImage, "Layer windows chose different presentation modes")
        let mode = if direct { "dmabuf" } else { "swapchain" }
        let expected = Environment.GetEnvironmentVariable("GOO_LAYER_STILL_IMAGE_EXPECT")
        Require(expected == nil || expected == mode, "Expected $expected but got $mode")
        if direct {
          Require(first.CaptureTargetForTest() == nil && second.CaptureTargetForTest() == nil,
            "Direct layer windows created swapchain targets")
          guard let storage = sharedImage.NativeStorage else { throw InvalidOperationException("Shared image was not uploaded") }
          VerifyCloseOnExec(storage)
          let count = FdCount()
          first.LayerImage = alternate
          Wait(first, second, () -> alternate.NativeStorage != nil)
          Require(Object.ReferenceEquals(sharedImage.NativeStorage, storage), "Replacing one output retired the other output's image")
          second.RequestClose()
          Wait(first, second, () -> !second.IsOpen && !first.SdlHostForTest()!!.StillImagePending)
          Require(sharedImage.NativeStorage == nil, "Closing the last output did not retire the old image")
          for _ in 0 ... 3 {
            first.LayerImage = sharedImage
            Wait(first, second, () -> sharedImage.NativeStorage != nil)
            Require(!first.SdlHostForTest()!!.WaylandVulkanFrameReady(), "The new still image did not request a frame callback")
            first.LayerImage = alternate
            first.PumpScheduled(0.0)
            Wait(first, second, () -> alternate.NativeStorage != nil && !first.SdlHostForTest()!!.StillImagePending)
          }
          first.LayerImage = nil
          Wait(first, second, () -> alternate.NativeStorage == nil && !first.SdlHostForTest()!!.StillImagePending)
          Require(FdCount() <= count, "Still-image replacement leaked file descriptors")
        } else {
          Require(first.CaptureTargetForTest() != nil && second.CaptureTargetForTest() != nil,
            "Fallback layer windows did not create swapchain targets")
          Wait(first, second, () -> first.PresentationAcceptedIndexForTest > 0uL && second.PresentationAcceptedIndexForTest > 0uL)
          let frame = first.PresentationAcceptedIndexForTest
          first.LayerImage = alternate
          Wait(first, second, () -> first.PresentationAcceptedIndexForTest > frame)
        }
        Require(first.Hide() == WindowOperationResult.Accepted, "Still-image layer window did not hide")
        Require(first.Show(activate: false) == WindowOperationResult.Accepted, "Still-image layer window did not show again")
        Wait(first, second, () -> first.IsVisible)
        Console.WriteLine("layer-still-image: $mode, image change and remap passed")
      } finally {
        first.RequestClose()
        if second.IsOpen { second.RequestClose() }
        Wait(first, second, () -> !first.IsOpen && !second.IsOpen)
      }
    }

    private func Open(image LayerWindowImage, width int32, height int32) Window -> Window{
      Background: Color.Rgb(17, 31, 47), LayerImage: image,
      LayerShell: LayerWindowOptions{Layer: WindowLayer.Background, Width: width, Height: height, StillImage: true},
    }.Open()

    private func Wait(first Window, second Window, condition Func[bool]) {
      let deadline = Environment.TickCount64 + 5000L
      while Environment.TickCount64 < deadline {
        SdlRuntime.PumpEvents(64)
        Pump(first)
        Pump(second)
        if condition.Invoke() { return }
        Thread.Sleep(1)
      }
      throw InvalidOperationException("Still-image layer window did not reach the expected state")
    }

    private func Pump(window Window) {
      if !window.IsOpen { return }
      window.RefreshSchedulerMetrics()
      let now = float64(Stopwatch.GetTimestamp())
      let frameDue = window.SchedulerFrameDue(now)
      if frameDue || window.SchedulerHasImmediateService() || window.SchedulerHasPendingQueueWork() {
        window.SchedulerPump(now, frameDue)
      }
    }

    private func FdCount() int32 -> Directory.GetFiles("/proc/self/fd").Length

    private func VerifyCloseOnExec(storage VulkanStillImage) {
      guard let exported = storage.Export() else { throw InvalidOperationException("No exported still-image descriptor") }
      using let fd = exported
      let descriptor = int32(fd.DangerousGetHandle())
      Require(DescriptorFlags(descriptor, 1) == 1, "The exported DMA-BUF does not have FD_CLOEXEC")
      let status = DescriptorFlags(descriptor, 3)
      Require(status >= 0 && (status & 3) == 0, "The exported DMA-BUF is not read-only")
      let name = descriptor.ToString()
      let infoPath = "/proc/self/fdinfo/" + name
      let inode = System.Text.RegularExpressions.Regex.Match(File.ReadAllText(infoPath), "(?m)^ino:\\s*(\\d+)$").Groups[1].Value
      Require(inode.Length > 0, "The exported DMA-BUF has no inode")
      let info = ProcessStartInfo("/bin/sh", []string{"-c",
        "! grep -Eq \"^ino:[[:space:]]*$2$\" \"$1\" 2>/dev/null", "sh", infoPath, inode})
      using let child = Process.Start(info) ?? throw InvalidOperationException("Cannot start descriptor probe")
      child.WaitForExit()
      Require(child.ExitCode == 0, "A child inherited the still-image DMA-BUF")
    }
  }
}
