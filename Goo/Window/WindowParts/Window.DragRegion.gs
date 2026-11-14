package Goo

/// Hosts a Goo tree in a native window.
public partial class Window {
  shared {
    /// Wraps content in a native drag region for undecorated windows without changing the content.
    /// Clickable or focusable descendants still win their own pointer input.
    /// @param content The declaration to wrap.
    /// @returns A fresh drag-region container.
    public func WithDragRegion(content Blob) Blob -> Container{DragsWindow: true, content}
  }
}
