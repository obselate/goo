package Goo

/// Identifies a captured pointer drag transition.
public enum PointerDragPhase {
  Started = 0;
  Moved = 1;
  Ended = 2;
  Canceled = 3;
}

/// Describes a primary-pointer drag in element-local and window coordinates.
public struct PointerDragEvent {
  internal prop Pointer PointerEvent { get; init; }
  /// Gets the drag transition.
  public prop Phase PointerDragPhase { get; init; }
  /// Gets the position relative to the receiving element.
  public prop Position Point { get -> Pointer.Position }
  /// Gets the position in logical window units.
  public prop WindowPosition Point { get -> Pointer.WindowPosition }
  /// Gets the displacement from the press position in element-local units.
  public prop Translation Point { get; init; }
  /// Gets movement from the previous sample in element-local units.
  public prop Delta Point { get -> Pointer.Delta }
  /// Gets the keyboard modifiers at this sample.
  public prop Modifiers KeyModifiers { get -> Pointer.Modifiers }
  /// Gets the pointer device.
  public prop Device PointerDevice { get -> Pointer.Device }
  /// Gets the stable pointer identifier.
  public prop PointerId int64 { get -> Pointer.PointerId }
  /// Stops further routing of this input sample.
  public func StopPropagation() -> Pointer.StopPropagation()
  /// Prevents the default behavior for this input sample.
  public func PreventDefault() -> Pointer.PreventDefault()
}
