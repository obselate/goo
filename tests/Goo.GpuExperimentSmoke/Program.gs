import Goo
import System

let expected = Environment.GetEnvironmentVariable("GOO_GPU_EXPERIMENT_EXPECTED")
let actual = VulkanGpuExperiments.Selected.ToString()
if actual != expected {
    throw InvalidOperationException("Expected " + expected + ", got " + actual)
}
Console.WriteLine(actual)
