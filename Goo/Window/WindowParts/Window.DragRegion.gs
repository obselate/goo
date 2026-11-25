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

    /// Marks a button as the custom maximize or restore control of an undecorated window.
    /// Windows 11 shows the Snap Layouts flyout when the pointer hovers it. Other platforms ignore the mark.
    /// Call on a button you created, before returning it. A received button throws.
    /// @param control button to mark
    /// @returns the same button
    public func MaximizeButton(control Button) Button {
      control.CheckMutable()
      control.MaximizesWindow = true
      return control
    }
  }
}
