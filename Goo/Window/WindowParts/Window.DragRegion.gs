package Goo

/// Hosts a Goo tree in a native window.
public partial class Window {
  shared {
    /// Marks a container subtree as a native drag region for undecorated windows.
    /// Clickable or focusable descendants still win their own pointer input.
    /// Call on a container you created, before returning it. A received container throws.
    /// @param region container to mark
    /// @returns the same container
    public func DragRegion(region Container) Container {
      region.CheckMutable()
      region.DragsWindow = true
      return region
    }
  }
}
