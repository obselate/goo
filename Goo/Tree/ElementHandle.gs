package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

/// Represents a consumer-owned handle for one mounted element.
public class ElementHandle {
  private var node Node?
  private var window Window?

  /// Initializes an unmounted element handle.
  public init() {
  }

  /// Reports whether this handle is currently attached to an element.
  public prop IsMounted bool{
    get -> mountedNode() != nil
  }

  /// Gets the transformed border box in window logical coordinates.
  /// An unmounted handle returns an empty rectangle.
  public prop BorderBox ElementRect{
    get {
      guard let n = mountedNode() else { return ElementRect{} }
      return ElementHandles.BorderBox(n)
    }
  }

  /// Gets the transformed content box in window logical coordinates.
  /// An unmounted handle returns an empty rectangle.
  public prop ContentBox ElementRect{
    get {
      guard let n = mountedNode() else { return ElementRect{} }
      return ElementHandles.ContentBox(n)
    }
  }

  /// Gets the current logical scroll offset.
  /// An unmounted handle returns the origin.
  public prop ScrollOffset Point{
    get {
      guard let n = mountedNode() else { return Point{} }
      return Point{ X: float64(n.ScrollX), Y: float64(n.ScrollY) }
    }
  }
  /// Gets the maximum legal logical scroll offset.
  /// An unmounted handle returns the origin.
  public prop ScrollRange Point{
    get {
      guard let n = mountedNode() else { return Point{} }
      return scrollRange(n)
    }
  }

  /// Occurs after this mounted element reaches a new stable geometry or scroll state.
  /// Callbacks run on the window UI thread after reconciliation and layout.
  public event MetricsChanged Action[ElementMetrics]{
    add{ MetricSubscriptions.AddElement(this, value) }
    remove{ MetricSubscriptions.RemoveElement(this, value) }
  }

  /// Moves keyboard focus to this focusable mounted element.
  /// @returns False when the handle is unmounted or the element cannot receive focus.
  public func Focus() bool {
    guard let n = mountedNode(), let owner = window else { return false }
    return owner.FocusElement(n)
  }

  /// Removes keyboard focus when this element owns it.
  /// @returns False when the handle is unmounted or does not own focus.
  public func Blur() bool {
    guard let n = mountedNode(), let owner = window else { return false }
    return owner.BlurElement(n)
  }

  /// Sets this element's logical scroll target.
  /// @param x The non-negative horizontal target.
  /// @param y The non-negative vertical target.
  /// @returns False when the handle is unmounted or the element is not scrollable.
  public func ScrollTo(x float64, y float64) bool {
    if !validScrollOffset(x) { throw ArgumentOutOfRangeException("x") }
    if !validScrollOffset(y) { throw ArgumentOutOfRangeException("y") }
    guard let n = mountedNode(), let owner = window else { return false }
    return owner.ScrollElementTo(n, x, y)
  }
  /// Immediately sets this element's logical scroll offset.
  /// @param x The non-negative horizontal offset.
  /// @param y The non-negative vertical offset.
  /// @returns False when the handle is unmounted or the element is not scrollable.
  public func JumpTo(x float64, y float64) bool {
    if !validScrollOffset(x) { throw ArgumentOutOfRangeException("x") }
    if !validScrollOffset(y) { throw ArgumentOutOfRangeException("y") }
    guard let n = mountedNode(), let owner = window else { return false }
    return owner.JumpElementTo(n, x, y)
  }

  /// Scrolls each scrollable ancestor enough to reveal this element.
  /// @returns False when the handle is unmounted.
  public func ScrollIntoView() bool {
    guard let n = mountedNode(), let owner = window else { return false }
    return owner.ScrollElementIntoView(n)
  }

  /// Sets the native IME caret/input rectangle in window logical coordinates.
  /// @returns False when the element is ineligible or native text input is unavailable.
  public func SetTextInputArea(area ElementRect) bool {
    validateTextInputArea(area)
    guard let n = mountedNode(), let owner = window else { return false }
    return owner.SetTextInputArea(n, area)
  }

  /// Gets the retained text position nearest to a point.
  /// @returns False when this is unmounted, not a text primitive, or has no current retained layout.
  public func TryGetTextPositionAt(point Point, space TextCoordinateSpace,
    out position TextPosition) bool{
      position = TextPosition{}
      guard let n = mountedNode() else { return false }
      return TextGeometryQueries.PositionAt(n, point, space, out position)
    }

  /// Gets the retained caret rectangle for a source UTF-16 text position.
  /// @returns False when this is unmounted, not a text primitive, or the position is not retained.
  public func TryGetTextCaretRect(position TextPosition, space TextCoordinateSpace,
    out rect ElementRect) bool{
      rect = ElementRect{}
      guard let n = mountedNode() else { return false }
      return TextGeometryQueries.CaretRect(n, position, space, out rect)
    }

  /// Copies retained rectangles for a source UTF-16 range into destination.
  /// @param required Receives the full rectangle count, including rectangles that did not fit.
  /// @returns False when this is unmounted, not a text primitive, the range is invalid, or no current retained layout exists.
  public func TryCopyTextRangeRects(textRange TextRange, space TextCoordinateSpace,
    destination Span[ElementRect], out required int32) bool{
      required = 0
      guard let n = mountedNode() else { return false }
      return TextGeometryQueries.CopyRangeRects(n, textRange, space, destination, out required)
    }

  internal func Attach(n Node, owner Window?) {
    if let current = node {
      if current != n {
        throw InvalidOperationException("An ElementHandle can be attached to only one element")
      }
    }
    node = n
    window = owner
  }

  internal func Detach(n Node) {
    if node == n {
      node = nil
      window = nil
    }
  }

  internal func AttachedNode() Node ? -> node

  internal func AttachedWindow() Window ? -> window

  internal func AttachedNodeFor(owner Window) Node? {
    if window != owner { return nil }
    if let current = node {
      if !current.Retired && ElementHandles.Owns(current, this) { return current }
    }
    return nil
  }

  private func mountedNode() Node? {
    if let owner = window {
      owner.RequireElementHandleThread("ElementHandle")
    }
    if let current = node {
      if !current.Retired && ElementHandles.Owns(current, this) {
        return current
      }
      node = nil
      window = nil
    }
    return nil
  }

  private func validScrollOffset(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value) && value >= 0.0

  private func validateTextInputArea(area ElementRect) {
    if !Double.IsFinite(area.X) || !Double.IsFinite(area.Y)
      || !Double.IsFinite(area.Width) || !Double.IsFinite(area.Height)
      || area.Width < 0.0 || area.Height < 0.0 {
        throw ArgumentOutOfRangeException("area")
      }
    let left = Math.Floor(area.X)
    let top = Math.Floor(area.Y)
    let right = Math.Ceiling(area.X + area.Width)
    let bottom = Math.Ceiling(area.Y + area.Height)
    let width = right - left
    let height = bottom - top
    if !Double.IsFinite(right) || !Double.IsFinite(bottom)
      || left < float64(Int32.MinValue) || top < float64(Int32.MinValue)
      || right > float64(Int32.MaxValue) || bottom > float64(Int32.MaxValue)
      || width > float64(Int32.MaxValue) || height > float64(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("area")
      }
  }
}

/// Describes one stable mounted-element geometry snapshot.
public data struct ElementMetrics {
  private var isMounted bool
  private var borderBox ElementRect
  private var contentBox ElementRect
  private var scrollOffset Point
  private var scrollRange Point

  /// Reports whether the element is mounted.
  public prop IsMounted bool{ get -> isMounted init -> isMounted = value }
  /// Gets the transformed border box in window logical coordinates.
  public prop BorderBox ElementRect{ get -> borderBox init -> borderBox = value }
  /// Gets the transformed content box in window logical coordinates.
  public prop ContentBox ElementRect{ get -> contentBox init -> contentBox = value }
  /// Gets the current logical scroll offset.
  public prop ScrollOffset Point{ get -> scrollOffset init -> scrollOffset = value }
  /// Gets the maximum legal logical scroll offset.
  public prop ScrollRange Point{ get -> scrollRange init -> scrollRange = value }
}

/// Specifies the coordinate space used by mounted text geometry queries.
public enum TextCoordinateSpace { Element; Content; Window }

/// Represents an axis-aligned rectangle in the requested logical coordinate space.
public data struct ElementRect {
  private var x float64
  private var y float64
  private var width float64
  private var height float64

  /// Gets the horizontal origin.
  public prop X float64{
    get -> x
    init -> x = value
  }

  /// Gets the vertical origin.
  public prop Y float64{
    get -> y
    init -> y = value
  }

  /// Gets the width.
  public prop Width float64{
    get -> width
    init -> width = value
  }

  /// Gets the height.
  public prop Height float64{
    get -> height
    init -> height = value
  }
}

internal class ElementHandles {
  shared {
    private let blobValues ConditionalWeakTable[Blob, ElementHandle] =
    ConditionalWeakTable[Blob, ElementHandle]()
    private let values ConditionalWeakTable[Node, ElementHandle] =
    ConditionalWeakTable[Node, ElementHandle]()
    @ThreadStatic
    private var owners Stack[Window]?

    internal func PushOwner(owner Window) {
      if owners == nil {
        owners = Stack[Window]()
      }
      owners!!.Push(owner)
    }

    internal func PopOwner() {
      owners!!.Pop()
    }

    internal func BlobHandle(b Blob) ElementHandle? {
      if blobValues.TryGetValue(b, out var value) {
        return value
      }
      return nil
    }

    internal func SetBlobHandle(b Blob, handle ElementHandle?) {
      blobValues.Remove(b)
      if let next = handle {
        blobValues.Add(b, next)
      }
    }

    internal func Bind(n Node, handle ElementHandle?) {
      if handle == nil && !n.HasElementHandle {
        return
      }
      var current ElementHandle?
      if values.TryGetValue(n, out var value) {
        current = value
      }
      if current == handle {
        if n.Kind != NodeKind.Text {
          TextLayouts.RemoveGeometry(n)
        }
        if let same = handle {
          let owner = currentOwner()
          let unchanged = same.AttachedNode() == n && same.AttachedWindow() == owner
          same.Attach(n, owner)
          if !unchanged {
            MetricSubscriptions.AttachElement(same, owner)
          }
        }
        return
      }
      TextLayouts.RemoveGeometry(n)
      let owner = currentOwner()
      if let next = handle {
        next.Attach(n, owner)
        MetricSubscriptions.AttachElement(next, owner)
      }
      if let prior = current {
        MetricSubscriptions.DetachElement(prior, owner ?? prior.AttachedWindow())
        values.Remove(n)
        prior.Detach(n)
        n.HasElementHandle = false
        n.HasSparseInputState = InputCallbacks.HasNodeCallbacks(n)
          || TextInputCallbacks.HasNodeCallbacks(n) || DragDropMetadata.HasNodeBindings(n)
      }
      if let next = handle {
        values.Add(n, next)
        n.HasElementHandle = true
        n.HasSparseInputState = true
        if n.Kind == NodeKind.Text {
          TextLayouts.Invalidate(n)
        }
        if n.Kind == NodeKind.Entry || n.Kind == NodeKind.Editor { TextGeometryQueries.Prepare(n) }
      }
    }

    internal func Detach(n Node) ElementHandle? {
      if !n.HasElementHandle {
        return nil
      }
      TextLayouts.RemoveGeometry(n)
      if values.TryGetValue(n, out var value) {
        MetricSubscriptions.DetachElement(value, currentOwner() ?? value.AttachedWindow())
        values.Remove(n)
        value.Detach(n)
        n.HasElementHandle = false
        n.HasSparseInputState = InputCallbacks.HasNodeCallbacks(n)
          || TextInputCallbacks.HasNodeCallbacks(n) || DragDropMetadata.HasNodeBindings(n)
        return value
      }
      n.HasElementHandle = false
      n.HasSparseInputState = InputCallbacks.HasNodeCallbacks(n)
        || TextInputCallbacks.HasNodeCallbacks(n) || DragDropMetadata.HasNodeBindings(n)
      return nil
    }

    internal func Owns(n Node, handle ElementHandle) bool {
      if !n.HasElementHandle {
        return false
      }
      if values.TryGetValue(n, out var value) {
        return value == handle
      }
      return false
    }

    internal func Current(n Node) ElementHandle? {
      if !n.HasElementHandle {
        return nil
      }
      if values.TryGetValue(n, out var value) {
        return value
      }
      return nil
    }

    private func currentOwner() Window? {
      if owners == nil || owners!!.Count == 0 {
        return nil
      }
      return owners!!.Peek()
    }

    internal func CurrentOwner() Window ? -> currentOwner()

    internal func BorderBox(n Node) ElementRect {
      let bounds = TransformGeometry.BoundsToWindow(n)
      return ElementRect{ X: float64(bounds.X), Y: float64(bounds.Y),
        Width: float64(bounds.W), Height: float64(bounds.H) }
    }

    internal func ContentBox(n Node) ElementRect {
      let left = TextLayouts.ContentLeft(n)
      let top = TextLayouts.ContentTop(n)
      let right = left + TextLayouts.ContentWidth(n)
      let bottom = top + TextLayouts.ContentHeight(n)
      let p0 = TransformGeometry.NodeToWindow(n, left, top)
      let p1 = TransformGeometry.NodeToWindow(n, right, top)
      let p2 = TransformGeometry.NodeToWindow(n, left, bottom)
      let p3 = TransformGeometry.NodeToWindow(n, right, bottom)
      if !p0.Valid || !p1.Valid || !p2.Valid || !p3.Valid {
        return ElementRect{ X: float64(left), Y: float64(top),
          Width: float64(right - left), Height: float64(bottom - top) }
      }
      let x = TransformGeometry.min4(p0.X, p1.X, p2.X, p3.X)
      let y = TransformGeometry.min4(p0.Y, p1.Y, p2.Y, p3.Y)
      let maxX = TransformGeometry.max4(p0.X, p1.X, p2.X, p3.X)
      let maxY = TransformGeometry.max4(p0.Y, p1.Y, p2.Y, p3.Y)
      return ElementRect{ X: float64(x), Y: float64(y),
        Width: float64(maxX - x), Height: float64(maxY - y) }
    }
  }
}

internal class ElementMetricSubscription {
  internal event Callbacks Action[ElementMetrics]
  internal var Last ElementMetrics
  internal var HasLast bool
  internal var Registration ElementMetricRegistration?

  internal prop HasCallbacks bool{ get -> Callbacks != nil }

  internal func AddCallback(callback Action[ElementMetrics]) {
    Callbacks += callback
  }

  internal func RemoveCallback(callback Action[ElementMetrics]) {
    Callbacks -= callback
  }

  internal func Notify(value ElementMetrics) {
    let callbacks = Callbacks
    callbacks?.Invoke(value)
  }
}

internal class ElementMetricRegistration {
  internal let Handle ElementHandle
  internal var Active bool

  internal init(handle ElementHandle) {
    Handle = handle
  }
}

internal class WindowMetricSubscription {
  internal event Callbacks Action[WindowMetrics]
  internal var Last WindowMetrics
  internal var HasLast bool
  internal var Reported WindowMetrics
  internal var HasReported bool
  internal var Elements List[ElementMetricRegistration]?
  internal var ElementsPending bool
  internal var WindowPending bool
  internal var ElementsDelivering bool
  internal var ElementsNeedCompaction bool

  internal prop HasCallbacks bool{ get -> Callbacks != nil }

  internal func AddCallback(callback Action[WindowMetrics]) {
    Callbacks += callback
  }

  internal func RemoveCallback(callback Action[WindowMetrics]) {
    Callbacks -= callback
  }

  internal func Notify(value WindowMetrics) {
    let callbacks = Callbacks
    callbacks?.Invoke(value)
  }
}

internal class MetricSubscriptions {
  shared {
    private var elementStates ConditionalWeakTable[ElementHandle, ElementMetricSubscription]?
    private var windowStates ConditionalWeakTable[Window, WindowMetricSubscription]?

    internal func AddElement(handle ElementHandle, callback Action[ElementMetrics]) {
      if callback == nil { throw ArgumentNullException("callback") }
      if let owner = handle.AttachedWindow() {
        owner.RequireElementHandleThread("ElementHandle.MetricsChanged")
      }
      let state = elementState(handle, true)!!
      state.AddCallback(callback)
      if let owner = handle.AttachedWindow() {
        attachElement(handle, owner, state)
        request(owner)
      }
    }

    internal func RemoveElement(handle ElementHandle, callback Action[ElementMetrics]) {
      if callback == nil {
        return
      }
      if let owner = handle.AttachedWindow() {
        owner.RequireElementHandleThread("ElementHandle.MetricsChanged")
      }
      guard let state = elementState(handle, false) else {
        return
      }
      state.RemoveCallback(callback)
      if state.HasCallbacks {
        return
      }
      removeElement(handle, state)
      elementStates?.Remove(handle)
    }

    internal func AttachElement(handle ElementHandle, owner Window?) {
      guard let window = owner, let state = elementState(handle, false) else {
        return
      }
      if !state.HasCallbacks {
        return
      }
      attachElement(handle, window, state)
      request(window)
    }

    internal func DetachElement(handle ElementHandle, owner Window?) {
      guard let window = owner, let state = elementState(handle, false) else {
        return
      }
      if !state.HasCallbacks {
        return
      }
      guard let windowState = windowState(window, false) else {
        return
      }
      guard let registration = state.Registration else {
        return
      }
      registration.Active = false
      windowState.ElementsPending = true
      windowState.ElementsNeedCompaction = true
      request(window)
    }

    internal func AddWindow(owner Window, callback Action[WindowMetrics]) {
      if callback == nil { throw ArgumentNullException("callback") }
      owner.RequireElementHandleThread("Window.MetricsChanged")
      let state = windowState(owner, true)!!
      state.AddCallback(callback)
      if !state.HasLast {
        state.WindowPending = true
        request(owner)
      }
    }

    internal func RemoveWindow(owner Window, callback Action[WindowMetrics]) {
      if callback == nil {
        return
      }
      owner.RequireElementHandleThread("Window.MetricsChanged")
      guard let state = windowState(owner, false) else {
        return
      }
      state.RemoveCallback(callback)
      if !state.HasCallbacks {
        state.HasLast = false
        state.WindowPending = false
        if state.Elements?.Count == 0 {
          windowStates?.Remove(owner)
        }
      }
    }

    internal func MarkWindowDirty(owner Window) {
      guard let state = windowState(owner, false) else {
        return
      }
      if !state.HasCallbacks {
        return
      }
      state.WindowPending = true
      request(owner)
    }

    internal func ReportWindowMetrics(owner Window, logicalWidth int32, logicalHeight int32,
      framebufferWidth int32, framebufferHeight int32) {
        guard let state = windowState(owner, false) else {
          return
        }
        let scaleX = logicalWidth > 0 && framebufferWidth > 0
        ? float64(framebufferWidth) / float64(logicalWidth) : 0.0
        let scaleY = logicalHeight > 0 && framebufferHeight > 0
        ? float64(framebufferHeight) / float64(logicalHeight) : 0.0
        state.Reported = WindowMetrics{
          LogicalWidth: logicalWidth,
          LogicalHeight: logicalHeight,
          FramebufferWidth: framebufferWidth,
          FramebufferHeight: framebufferHeight,
          DisplayScaleX: scaleX,
          DisplayScaleY: scaleY,
        }
        state.HasReported = true
        MarkWindowDirty(owner)
      }

    internal func ReportedWindowMetrics(owner Window) WindowMetrics? {
      guard let state = windowState(owner, false) else {
        return nil
      }
      return state.HasReported ? state.Reported : nil
    }

    internal func MarkElementsDirty(owner Window) {
      guard let state = windowState(owner, false) else {
        return
      }
      if state.Elements?.Count == 0 {
        return
      }
      state.ElementsPending = true
    }

    internal func Flush(owner Window) {
      guard let state = windowState(owner, false) else {
        return
      }
      let windowPending = state.WindowPending
      let elementsPending = state.ElementsPending
      var elementCount int32
      if elementsPending {
        if let elements = state.Elements {
          elementCount = elements.Count
        }
      }
      state.WindowPending = false
      state.ElementsPending = false
      state.ElementsDelivering = true
      var completed = false
      try {
        flushWindow(owner, state, windowPending)
        flushElements(state, elementsPending, elementCount)
        completed = true
      } finally {
        state.ElementsDelivering = false
        compactElements(state)
        if !completed {
          state.WindowPending = true
          state.ElementsPending = true
        }
      }
    }

    internal func ClearWindow(owner Window) {
      guard let state = windowState(owner, false) else {
        return
      }
      state.Elements?.Clear()
      state.ElementsPending = false
      state.WindowPending = false
      windowStates?.Remove(owner)
    }

    internal func HasDemand(owner Window) bool {
      guard let state = windowState(owner, false) else { return false }
      return state.WindowPending || state.ElementsPending
    }

    private func flushWindow(owner Window, state WindowMetricSubscription, accepted bool) {
      if !accepted {
        return
      }
      if !state.HasCallbacks {
        return
      }
      let next = owner.CurrentWindowMetrics()
      let notify = !state.HasLast || !sameWindowMetrics(state.Last, next)
      if !notify {
        return
      }
      state.Last = next
      state.HasLast = true
      state.Notify(next)
    }

    private func flushElements(state WindowMetricSubscription, accepted bool, count int32) {
      if !accepted {
        return
      }
      for i in 0 ... count {
        let registration = state.Elements!! [i]
        notifyElement(registration.Handle)
      }
    }

    private func notifyElement(handle ElementHandle) {
      guard let state = elementState(handle, false) else {
        return
      }
      if !state.HasCallbacks {
        return
      }
      let next = captureElement(handle)
      let notify = !state.HasLast || !sameElementMetrics(state.Last, next)
      if !notify {
        return
      }
      state.Last = next
      state.HasLast = true
      state.Notify(next)
    }

    private func captureElement(handle ElementHandle) ElementMetrics {
      guard let node = handle.AttachedNode() else {
        return ElementMetrics{}
      }
      if node.Retired || !ElementHandles.Owns(node, handle) {
        return ElementMetrics{}
      }
      return ElementMetrics{
        IsMounted: true,
        BorderBox: ElementHandles.BorderBox(node),
        ContentBox: ElementHandles.ContentBox(node),
        ScrollOffset: Point{ X: float64(node.ScrollX), Y: float64(node.ScrollY) },
        ScrollRange: scrollRange(node),
      }
    }

    private func attachElement(handle ElementHandle, owner Window, state ElementMetricSubscription) {
      let windowState = windowState(owner, true)!!
      let elements = ensureElements(windowState)
      var registration = state.Registration
      if registration == nil {
        registration = ElementMetricRegistration(handle)
        state.Registration = registration
      }
      let entry = registration
      let wasInactive = !entry.Active
      entry.Active = true
      if !elements.Contains(entry) { elements.Add(entry) }
      if wasInactive {
        windowState.ElementsPending = true
      }
    }

    private func removeElement(handle ElementHandle, state ElementMetricSubscription) {
      guard let registration = state.Registration else {
        return
      }
      registration.Active = false
      guard let owner = handle.AttachedWindow(), let windowState = windowState(owner, false) else {
        return
      }
      if windowState.ElementsDelivering {
        windowState.ElementsNeedCompaction = true
      } else {
        removeRegistration(windowState, registration)
      }
    }

    private func request(owner Window) {
      owner.WakeMetricSubscribers()
    }

    private func elementState(handle ElementHandle, create bool) ElementMetricSubscription? {
      if elementStates == nil {
        if !create { return nil }
        elementStates = ConditionalWeakTable[ElementHandle, ElementMetricSubscription]()
      }
      if elementStates!!.TryGetValue(handle, out var state) { return state }
      if !create { return nil }
      let fresh = ElementMetricSubscription()
      elementStates!!.Add(handle, fresh)
      return fresh
    }

    private func windowState(owner Window, create bool) WindowMetricSubscription? {
      if windowStates == nil {
        if !create { return nil }
        windowStates = ConditionalWeakTable[Window, WindowMetricSubscription]()
      }
      if windowStates!!.TryGetValue(owner, out var state) { return state }
      if !create { return nil }
      let fresh = WindowMetricSubscription()
      windowStates!!.Add(owner, fresh)
      return fresh
    }

    private func ensureElements(state WindowMetricSubscription) List[ElementMetricRegistration] {
      if state.Elements == nil { state.Elements = List[ElementMetricRegistration]() }
      return state.Elements!!
    }

    private func compactElements(state WindowMetricSubscription) {
      if !state.ElementsNeedCompaction {
        return
      }
      state.ElementsNeedCompaction = false
      guard let elements = state.Elements else {
        return
      }
      var i = elements.Count - 1
      while i >= 0 {
        if !elements[i].Active {
          removeAt(elements, i)
        }
        i--
      }
    }

    private func removeRegistration(state WindowMetricSubscription, registration ElementMetricRegistration) {
      guard let elements = state.Elements else {
        return
      }
      let index = elements.IndexOf(registration)
      if index >= 0 {
        removeAt(elements, index)
      }
    }

    private func removeAt(values List[ElementMetricRegistration], index int32) {
      let last = values.Count - 1
      if index < last { values[index] = values[last] }
      values.RemoveAt(last)
    }
  }
}

private func sameElementMetrics(left ElementMetrics, right ElementMetrics) bool -> left.IsMounted == right.IsMounted && sameElementRect(left.BorderBox, right.BorderBox)
  && sameElementRect(left.ContentBox, right.ContentBox)
  && left.ScrollOffset.X == right.ScrollOffset.X && left.ScrollOffset.Y == right.ScrollOffset.Y
  && left.ScrollRange.X == right.ScrollRange.X && left.ScrollRange.Y == right.ScrollRange.Y

private func sameElementRect(left ElementRect, right ElementRect) bool -> left.X == right.X && left.Y == right.Y && left.Width == right.Width && left.Height == right.Height

private func sameWindowMetrics(left WindowMetrics, right WindowMetrics) bool -> left.LogicalWidth == right.LogicalWidth && left.LogicalHeight == right.LogicalHeight
  && left.FramebufferWidth == right.FramebufferWidth && left.FramebufferHeight == right.FramebufferHeight
  && left.DisplayScaleX == right.DisplayScaleX && left.DisplayScaleY == right.DisplayScaleY

internal class TextGeometryQueries {
  shared {
    internal func Prepare(n Node) {
      if n.Kind == NodeKind.Entry {
        var rect Rect
        entryCaretRect(n, TextPosition{ Offset: 0, Affinity: TextAffinity.Downstream }, out rect)
      }
      if n.Kind == NodeKind.Editor {
        TextEditorLayouts.PrepareCurrentGeometry(n)
      }
    }

    internal func PositionAt(n Node, point Point, space TextCoordinateSpace,
      out position TextPosition) bool{
        position = TextPosition{}
        guard let local = toElementPoint(n, point, space) else { return false }
        return switch n.Kind {
          case NodeKind.Text: staticPositionAt(n, local, out position)
          case NodeKind.Entry: entryPositionAt(n, local, out position)
          case NodeKind.Editor: editorPositionAt(n, local, out position)
          default: false
        }
      }

    internal func CaretRect(n Node, position TextPosition, space TextCoordinateSpace,
      out rect ElementRect) bool{
        rect = ElementRect{}
        if !validSpace(space) || !validAffinity(position.Affinity) { return false }
        var local Rect
        let found = switch n.Kind {
          case NodeKind.Text: staticCaretRect(n, position, out local)
          case NodeKind.Entry: entryCaretRect(n, position, out local)
          case NodeKind.Editor: TextEditorLayouts.TryCaretRectForGeometry(n, position, out local)
          default: false
        }
        if !found { return false }
        return convertRect(n, local, space, out rect)
      }

    internal func CopyRangeRects(n Node, textRange TextRange, space TextCoordinateSpace,
      destination Span[ElementRect], out required int32) bool{
        required = 0
        if !validSpace(space) || textRange.Start < 0 || textRange.Length < 0 {
          return false
        }
        if space == TextCoordinateSpace.Window && !windowMappingValid(n) {
          return false
        }
        return switch n.Kind {
          case NodeKind.Text: copyStaticRange(n, textRange, space, destination, out required)
          case NodeKind.Entry: copyEntryRange(n, textRange, space, destination, out required)
          case NodeKind.Editor: copyEditorRange(n, textRange, space, destination, out required)
          default: false
        }
      }

    private func staticPositionAt(n Node, local Point, out position TextPosition) bool {
      position = TextPosition{}
      guard let layout = TextLayouts.CurrentForGeometry(n) else { return false }
      guard let geometry = layout.Geometry else { return false }
      if layout.Lines.Count == 0 || geometry.Lines.Count != layout.Lines.Count { return false }
      let contentX = TextLayouts.ContentLeft(n) - n.Rect.X
      let contentY = TextLayouts.ContentTop(n) - n.Rect.Y
      let lineHeight = TextLayouts.resolvedLineHeight(n)
      if lineHeight <= 0.0F { return false }
      var index = int32((float32(local.Y) - contentY) / lineHeight)
      if index < 0 { index = 0 }
      if index >= layout.Lines.Count { index = layout.Lines.Count - 1 }
      let line = layout.Lines[index]
      let geometryLine = geometry.Lines[index]
      guard let shape = line.Shape else { return false }
      let x = float32(local.X) - contentX - TextLayouts.lineOffset(n, line, TextLayouts.ContentWidth(n))
      let hit = shape.HitTest(x)
      let display = geometryLine.DisplayStart + hit.Index
      if geometryLine.VisibleEnd < geometryLine.DisplayEnd
        && hit.Index >= geometryLine.VisibleEnd - geometryLine.DisplayStart{
          position = TextPosition{ Offset: geometryLine.VisibleEnd, Affinity: TextAffinity.Upstream }
          return true
        }
      let retainedDisplay = display > geometryLine.VisibleEnd ? geometryLine.VisibleEnd : display
      position = TextPosition{ Offset: retainedDisplay, Affinity: TextAffinity(hit.Affinity) }
      return true
    }

    private func entryPositionAt(n Node, local Point, out position TextPosition) bool {
      position = TextPosition{}
      guard let shape = cachedEntryShape(n) else { return false }
      let contentX = TextLayouts.ContentLeft(n) - n.Rect.X
      let hit = shape.HitTest(float32(local.X) - contentX - entryOffset(n, shape) + n.EditScrollX)
      position = TextPosition{ Offset: entrySourceOffset(n.EntryShape!!, hit.Index),
        Affinity: TextAffinity(hit.Affinity) }
      return true
    }

    private func editorPositionAt(n Node, local Point, out position TextPosition) bool -> TextEditorLayouts.TryHitTestForGeometry(n, float32(local.X), float32(local.Y),
      out position)

    private func staticCaretRect(n Node, position TextPosition, out rect Rect) bool {
      rect = Rect{}
      if position.Offset < 0 || position.Offset > n.Content.Length { return false }
      guard let layout = TextLayouts.CurrentForGeometry(n) else { return false }
      guard let geometry = layout.Geometry else { return false }
      if geometry.Lines.Count != layout.Lines.Count { return false }
      var display = position.Offset
      if display > 0 && display < n.Content.Length && n.Content[display] == 10
        && n.Content[display - 1] == 13 {
          display = display - 1
        }
      let lineIndex = staticLineForDisplay(layout, geometry, display, position.Affinity)
      if lineIndex < 0 { return false }
      let line = layout.Lines[lineIndex]
      let geometryLine = geometry.Lines[lineIndex]
      if display > geometryLine.VisibleEnd { return false }
      guard let shape = line.Shape else { return false }
      let localIndex = display - geometryLine.DisplayStart
      if localIndex < 0 || localIndex > line.Content.Length { return false }
      let contentX = TextLayouts.ContentLeft(n) - n.Rect.X
      let contentY = TextLayouts.ContentTop(n) - n.Rect.Y
      let height = TextLayouts.resolvedLineHeight(n)
      rect = Rect{ X: contentX + TextLayouts.lineOffset(n, line, TextLayouts.ContentWidth(n))
        +shape.CaretX(localIndex, int32(position.Affinity)),
        Y: contentY + float32(lineIndex) * height, W: 1.5F, H: height }
      return true
    }

    private func entryCaretRect(n Node, position TextPosition, out rect Rect) bool {
      rect = Rect{}
      if position.Offset < 0 || position.Offset > n.Buffer.Length { return false }
      guard let shape = cachedEntryShape(n) else { return false }
      let contentHeight = TextLayouts.ContentHeight(n)
      let height = shape.Descent - shape.Ascent
      let top = TextLayouts.ContentTop(n) - n.Rect.Y + (contentHeight - height) * 0.5F
      rect = Rect{ X: TextLayouts.ContentLeft(n) - n.Rect.X + entryOffset(n, shape) - n.EditScrollX
        +shape.CaretX(entryDisplayOffset(n.EntryShape!!, position.Offset, position.Affinity),
          int32(position.Affinity)), Y: top, W: 1.5F, H: height }
      return true
    }

    private func copyStaticRange(n Node, textRange TextRange, space TextCoordinateSpace,
      destination Span[ElementRect], out required int32) bool{
        required = 0
        if !validRange(textRange, n.Content.Length) { return false }
        guard let layout = TextLayouts.CurrentForGeometry(n) else { return false }
        guard let geometry = layout.Geometry else { return false }
        if geometry.Lines.Count != layout.Lines.Count { return false }
        let start = textRange.Start
        let end = textRange.Start + textRange.Length
        if end < start { return false }
        let contentX = TextLayouts.ContentLeft(n) - n.Rect.X
        let contentY = TextLayouts.ContentTop(n) - n.Rect.Y
        let height = TextLayouts.resolvedLineHeight(n)
        let values = stackalloc[64]float32
        for i in 0 ... layout.Lines.Count {
          let line = layout.Lines[i]
          let geometryLine = geometry.Lines[i]
          if end <= geometryLine.DisplayStart || start >= geometryLine.VisibleEnd { continue }
          guard let shape = line.Shape else { continue }
          var lineStart = start > geometryLine.DisplayStart ? start : geometryLine.DisplayStart
          var lineEnd = end < geometryLine.VisibleEnd ? end : geometryLine.VisibleEnd
          if lineStart < geometryLine.DisplayStart { lineStart = geometryLine.DisplayStart }
          if lineEnd > geometryLine.DisplayStart + line.Content.Length {
            lineEnd = geometryLine.DisplayStart + line.Content.Length
          }
          if lineEnd <= lineStart { continue }
          let rectCount = shape.SelectionRectCount(lineStart - geometryLine.DisplayStart,
            lineEnd - geometryLine.DisplayStart)
          var rectOffset int32 = 0
          while rectOffset < rectCount {
            let copied = shape.CopySelectionRects(lineStart - geometryLine.DisplayStart,
              lineEnd - geometryLine.DisplayStart, rectOffset, values)
            var value int32 = 0
            while value + 1 < copied {
              let raw = Rect{ X: contentX + TextLayouts.lineOffset(n, line, TextLayouts.ContentWidth(n))
                +values[value], Y: contentY + float32(i) * height,
                W: values[value + 1] - values[value], H: height }
              if !appendRect(n, raw, space, destination, required) {
                required = 0
                return false
              }
              required++
              value = value + 2
            }
            if copied == 0 { break }
            rectOffset = rectOffset + copied / 2
          }
        }
        return true
      }

    private func copyEntryRange(n Node, textRange TextRange, space TextCoordinateSpace,
      destination Span[ElementRect], out required int32) bool{
        required = 0
        if !validRange(textRange, n.Buffer.Length) { return false }
        guard let shape = cachedEntryShape(n) else { return false }
        let contentHeight = TextLayouts.ContentHeight(n)
        let height = shape.Descent - shape.Ascent
        let top = TextLayouts.ContentTop(n) - n.Rect.Y + (contentHeight - height) * 0.5F
        let x = TextLayouts.ContentLeft(n) - n.Rect.X + entryOffset(n, shape) - n.EditScrollX
        let start = entryDisplayOffset(n.EntryShape!!, textRange.Start, TextAffinity.Downstream)
        let end = entryDisplayOffset(n.EntryShape!!, textRange.Start + textRange.Length,
          TextAffinity.Upstream)
        let rectCount = shape.SelectionRectCount(start, end)
        var rectOffset int32 = 0
        let values = stackalloc[64]float32
        while rectOffset < rectCount {
          let copied = shape.CopySelectionRects(start, end, rectOffset, values)
          var value int32 = 0
          while value + 1 < copied {
            let raw = Rect{ X: x + values[value], Y: top,
              W: values[value + 1] - values[value], H: height }
            if !appendRect(n, raw, space, destination, required) {
              required = 0
              return false
            }
            required++
            value = value + 2
          }
          if copied == 0 { break }
          rectOffset = rectOffset + copied / 2
        }
        return true
      }

    private func copyEditorRange(n Node, textRange TextRange, space TextCoordinateSpace,
      destination Span[ElementRect], out required int32) bool{
        required = 0
        guard let state = n.EditorState else { return false }
        if !validRange(textRange, state.Document.Length) { return false }
        guard let layout = TextEditorLayouts.CurrentForGeometry(n) else { return false }
        let start = textRange.Start
        let end = textRange.Start + textRange.Length
        let contentX = TextLayouts.ContentLeft(n) - n.Rect.X
        let contentY = TextLayouts.ContentTop(n) - n.Rect.Y
        let scrollX = float32(state.Controller.ScrollTargetX)
        let scrollY = float32(state.Controller.ScrollTargetY)
        let values = stackalloc[64]float32
        for i in 0 ... layout.Lines.Count {
          let line = layout.Lines[i]
          if end <= line.SourceStart || start >= line.SourceEnd { continue }
          guard let shape = line.Shape else { continue }
          let lineStart = start > line.SourceStart ? start : line.SourceStart
          let lineEnd = end < line.SourceEnd ? end : line.SourceEnd
          if lineEnd <= lineStart { continue }
          let displayStart = TextEditorLayouts.DisplayOffsetForSource(line.Paragraph, lineStart,
            TextAffinity.Downstream) - line.DisplayStart
          let displayEnd = TextEditorLayouts.DisplayOffsetForSource(line.Paragraph, lineEnd,
            TextAffinity.Upstream) - line.DisplayStart
          let x = contentX + TextEditorLayouts.editorLineOffset(n, line, TextLayouts.ContentWidth(n)) - scrollX
          var rectOffset int32 = 0
          var rectCount int32 = 0
          while rectOffset < rectCount || rectOffset == 0 {
            let copied = TextEditorLayouts.CopySelectionRectsForGeometry(line, displayStart,
              displayEnd, rectOffset, values, out rectCount)
            var value int32 = 0
            while value + 1 < copied {
              let raw = Rect{ X: x + values[value], Y: contentY + line.Top - scrollY,
                W: values[value + 1] - values[value], H: line.Height }
              if !appendRect(n, raw, space, destination, required) {
                required = 0
                return false
              }
              required++
              value = value + 2
            }
            if copied == 0 { break }
            rectOffset = rectOffset + copied / 2
          }
        }
        return true
      }

    private func toElementPoint(n Node, point Point, space TextCoordinateSpace) Point? {
      if !validSpace(space) || !motionFinite(point.X) || !motionFinite(point.Y) { return nil }
      if space == TextCoordinateSpace.Element {
        return point
      }
      if space == TextCoordinateSpace.Content {
        return Point{ X: point.X + float64(TextLayouts.ContentLeft(n) - n.Rect.X - textScrollX(n)),
          Y: point.Y + float64(TextLayouts.ContentTop(n) - n.Rect.Y - textScrollY(n)) }
      }
      let mapped = TransformGeometry.WindowToNode(n, float32(point.X), float32(point.Y))
      if !mapped.Valid { return nil }
      return Point{ X: float64(mapped.X - n.Rect.X), Y: float64(mapped.Y - n.Rect.Y) }
    }

    private func convertRect(n Node, raw Rect, space TextCoordinateSpace,
      out rect ElementRect) bool{
        rect = ElementRect{}
        if space == TextCoordinateSpace.Element {
          rect = ElementRect{ X: float64(raw.X), Y: float64(raw.Y), Width: float64(raw.W),
            Height: float64(raw.H) }
          return true
        }
        if space == TextCoordinateSpace.Content {
          rect = ElementRect{ X: float64(raw.X - (TextLayouts.ContentLeft(n) - n.Rect.X)
            +textScrollX(n)),
            Y: float64(raw.Y - (TextLayouts.ContentTop(n) - n.Rect.Y) + textScrollY(n)),
            Width: float64(raw.W), Height: float64(raw.H) }
          return true
        }
        let x = n.Rect.X + raw.X
        let y = n.Rect.Y + raw.Y
        let p0 = TransformGeometry.NodeToWindow(n, x, y)
        let p1 = TransformGeometry.NodeToWindow(n, x + raw.W, y)
        let p2 = TransformGeometry.NodeToWindow(n, x, y + raw.H)
        let p3 = TransformGeometry.NodeToWindow(n, x + raw.W, y + raw.H)
        if !p0.Valid || !p1.Valid || !p2.Valid || !p3.Valid { return false }
        let left = TransformGeometry.min4(p0.X, p1.X, p2.X, p3.X)
        let top = TransformGeometry.min4(p0.Y, p1.Y, p2.Y, p3.Y)
        let right = TransformGeometry.max4(p0.X, p1.X, p2.X, p3.X)
        let bottom = TransformGeometry.max4(p0.Y, p1.Y, p2.Y, p3.Y)
        rect = ElementRect{ X: float64(left), Y: float64(top), Width: float64(right - left),
          Height: float64(bottom - top) }
        return true
      }

    private func appendRect(n Node, raw Rect, space TextCoordinateSpace,
      destination Span[ElementRect], index int32) bool{
        var converted ElementRect
        if !convertRect(n, raw, space, out converted) { return false }
        if index < destination.Length { destination[index] = converted }
        return true
      }

    private func staticLineForDisplay(layout TextLayout, geometry TextLayoutGeometry, display int32,
      affinity TextAffinity) int32{
        var fallback = -1
        for i in 0 ... layout.Lines.Count {
          let line = geometry.Lines[i]
          if display < line.DisplayStart || display > line.DisplayEnd { continue }
          fallback = i
          if display > line.DisplayStart && display < line.DisplayEnd { return i }
          if display == line.DisplayStart && affinity == TextAffinity.Downstream { return i }
          if display == line.DisplayEnd && affinity == TextAffinity.Upstream { return i }
        }
        return fallback
      }

    private func cachedEntryShape(n Node) ShapedText? {
      guard let cached = n.EntryShape, let shape = cached.Shape else { return nil }
      if cached.Content != n.Buffer || cached.FontFamily != n.FontFamily
        || cached.FontSize != TextLayouts.fontSize(n) || cached.FontWeight != n.FontWeight
        || cached.Italic != (n.FontStyle == FontStyle.Italic)
        || cached.Spacing != TextLayouts.letterSpacing(n) || cached.Direction != int32(n.Direction)
        || cached.Password != n.Password{
          return nil
        }
      return shape
    }

    private func entryOffset(n Node, shape ShapedText) float32 {
      let free = TextLayouts.ContentWidth(n) - shape.Width
      if free <= 0.0F { return 0.0F }
      return switch n.TextAlign {
        case TextAlign.Center: free * 0.5F
        case TextAlign.Right: free
        case TextAlign.Start: shape.RightToLeft ? free : 0.0F
        case TextAlign.End: shape.RightToLeft ? 0.0F : free
        default: 0.0F
      }
    }

    private func textScrollX(n Node) float32 {
      if n.Kind == NodeKind.Entry { return n.EditScrollX }
      if n.Kind == NodeKind.Editor {
        if let state = n.EditorState { return float32(state.Controller.ScrollTargetX) }
      }
      return 0.0F
    }

    private func textScrollY(n Node) float32 {
      if n.Kind == NodeKind.Editor {
        if let state = n.EditorState { return float32(state.Controller.ScrollTargetY) }
      }
      return 0.0F
    }

    private func validSpace(space TextCoordinateSpace) bool -> space == TextCoordinateSpace.Element || space == TextCoordinateSpace.Content
      || space == TextCoordinateSpace.Window

    private func validAffinity(value TextAffinity) bool -> value == TextAffinity.Upstream || value == TextAffinity.Downstream

    private func validRange(value TextRange, length int32) bool -> value.Start >= 0 && value.Start <= length && value.Length >= 0
      && value.Length <= length - value.Start

    private func windowMappingValid(n Node) bool -> TransformGeometry.NodeToWindow(n, n.Rect.X, n.Rect.Y).Valid
  }
}
