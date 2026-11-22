## Fixed

- Fix an intermittent crash at process exit with software Vulkan. At exit, Goo waits for Vulkan submissions and completion waits, waits up to 5 seconds for a present call, and then waits for submitted rendering to finish before it returns.
