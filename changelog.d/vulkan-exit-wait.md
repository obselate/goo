## Fixed

- Fix an intermittent crash at process exit with software Vulkan. At exit, Goo waits for all submitted rendering to finish. Only a present call blocked for more than 5 seconds is abandoned, and no new work starts after it.
