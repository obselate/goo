package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System

func RunPipelineCacheBenchmark() {
  let root = ReadbackSmokeCell{}
  var window Window? = nil
  var metrics VulkanPipelineCacheMetrics
  try {
    let opened = ReadbackOpenCell(root)
    window = opened
    metrics = WindowReadbackTestFixture.MaterializePipelineCache(opened)
    Require(metrics.GraphicsPipelineCreateCount >= 13L,
      "Pipeline cache benchmark did not materialize the complete built-in pipeline set")
    opened.RequestClose()
    WindowReadbackTestFixture.Pump(opened, 0.0)
    Require(!opened.IsOpen, "Pipeline cache benchmark window did not close")
  } finally {
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.Pump(active, 0.0)
      }
    }
  }
  Console.WriteLine("pipeline-cache-benchmark: enabled=" + metrics.Enabled.ToString()
    +" loaded_bytes=" + metrics.LoadedBytes.ToString()
    +" pipeline_count=" + metrics.GraphicsPipelineCreateCount.ToString()
    +" pipeline_create_ns=" + metrics.GraphicsPipelineCreateNanoseconds.ToString())
}
