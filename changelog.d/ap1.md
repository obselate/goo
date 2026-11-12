## Changed

- Breaking: Move process startup and activation to static `Application`. Replace `Window.ConfigureApplication` with `Application.Configure`, `Window.ApplicationActivated` with `Application.Activated`, `Window.PostApplicationActivation` with `Application.PostActivation`, and `window.Run()` with `Application.Run(window)`.
- Breaking: Replace `Window.InitializeApplicationActivation` and `SingleInstance.AcquireAsync` with synchronous `Application.AcquireSingleInstance(arguments, timeoutMs)` before opening a window. Configure the identity first and retain the primary lease until shutdown.
- Breaking: `Window.Open()` throws `GraphicsUnavailableException` when no usable Vulkan device, surface or required feature exists. Catch this type for graphics startup failures. Other startup errors keep their exception types.

## Added

- Read process identity with `Application.Configure(assembly)`. Set the MSBuild `Product`, `InformationalVersion` and `GooPackageId` properties.
