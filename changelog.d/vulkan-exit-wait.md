## Fixed

- Fix an intermittent crash at process exit with software Vulkan. Goo now waits for Vulkan submissions and completion waits at exit, and waits up to 5 seconds for a present call.
