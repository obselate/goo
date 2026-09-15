package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.Threading

func RunVSyncSmoke() {
  let root = ReadbackSmokeCell{}
  var window Window? = nil
  var initialGeneration uint64 = 0uL
  var offGeneration uint64 = 0uL
  var finalGeneration uint64 = 0uL
  try {
    let opened = Window{
      Title: "Goo Runtime VSync transition gate",
      Width: 320,
      Height: 180,
      VSync: true,
      Root: root,
    }
    window = opened
    opened.Open()
    var initialMode = WindowReadbackTestFixture.PresentMode(opened)
    var offMode = WindowReadbackTestFixture.PresentMode(opened)
    var finalMode = WindowReadbackTestFixture.PresentMode(opened)
    let initialDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 4L
    while Stopwatch.GetTimestamp() < initialDeadline && initialGeneration == 0uL {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      initialMode = WindowReadbackTestFixture.PresentMode(opened)
      initialGeneration = WindowReadbackTestFixture.PresentGeneration(opened)
      if initialGeneration == 0uL {
        Thread.Sleep(1)
      }
    }
    Require(initialGeneration > 0uL
        && initialMode == VkConstants.VK_PRESENT_MODE_FIFO_KHR,
      "Runtime VSync-on did not create a FIFO swapchain")

    opened.VSync = false
    let offDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 4L
    while Stopwatch.GetTimestamp() < offDeadline
      && (offGeneration == 0uL || offGeneration == initialGeneration) {
        WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
        offMode = WindowReadbackTestFixture.PresentMode(opened)
        offGeneration = WindowReadbackTestFixture.PresentGeneration(opened)
        if offGeneration == 0uL || offGeneration == initialGeneration {
          Thread.Sleep(1)
        }
      }
    Require(offGeneration != 0uL && offGeneration != initialGeneration
        && (offMode == VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR
            || offMode == VkConstants.VK_PRESENT_MODE_MAILBOX_KHR
            || offMode == VkConstants.VK_PRESENT_MODE_FIFO_KHR)
        && offMode != VkConstants.VK_PRESENT_MODE_FIFO_RELAXED_KHR,
      "Runtime VSync-off did not recreate an allowed present mode")

    opened.VSync = true
    let finalDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 4L
    while Stopwatch.GetTimestamp() < finalDeadline
      && (finalGeneration == 0uL || finalGeneration == offGeneration) {
        WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
        finalMode = WindowReadbackTestFixture.PresentMode(opened)
        finalGeneration = WindowReadbackTestFixture.PresentGeneration(opened)
        if finalGeneration == 0uL || finalGeneration == offGeneration {
          Thread.Sleep(1)
        }
      }
    Require(finalGeneration != 0uL && finalGeneration != offGeneration
        && finalMode == VkConstants.VK_PRESENT_MODE_FIFO_KHR,
      "Runtime VSync-on transition did not restore FIFO")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Runtime VSync transition gate window did not close")
    let offModeName = if offMode == VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR {
      "immediate"
    } else if offMode == VkConstants.VK_PRESENT_MODE_MAILBOX_KHR {
      "mailbox"
    } else {
      "fifo"
    }
    Console.WriteLine("vsync-smoke: initial=fifo off="
      +offModeName + " generations=3 close=1")
  } finally {
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
}
