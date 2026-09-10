package Goo

internal interface VulkanSurfaceHost {
  prop LogicalWidth int32 { get; }
  prop LogicalHeight int32 { get; }
  prop Transparent bool { get; }
  prop VSync bool { get; }
  prop WindowHandle nint { get; }
  prop PreferRequestedFramebufferExtent bool { get; }
  prop AllowInheritedCompositeAlpha bool { get; }

  func Wake();
  func RefreshDisplayPacing(reset bool);
  func LoadVulkanLibrary() bool;
  func GetVulkanGetInstanceProcAddr() nint;
  func UnloadVulkanLibrary();
  func GetVulkanInstanceExtensions() []string;
  func CreateVulkanSurface(instance nint, out surface uint64) bool;
  func DestroyVulkanSurface(instance nint, surface uint64);
}
