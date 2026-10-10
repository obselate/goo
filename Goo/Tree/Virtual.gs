package Goo

import System
import Facebook.Yoga

/// Defines a scrolling element that takes its children from a VirtualSource and mounts only the items that the
/// source places. Items use content coordinates: the origin is the start of the content box at scroll offset zero,
/// so a scroll offset is also the content coordinate at the start of the viewport.
public class Virtual : Blob {
  private let source VirtualSource

  internal override func coreBlob() {
  }

  internal prop Source VirtualSource{ get -> source }

  /// Reports whether scroll content stays pinned to the bottom.
  public prop PinToBottom bool{ get; init; }

  /// Initializes a list element that scrolls on both axes.
  /// @param source The item policy. Create a new source on each build to supply new inputs.
  public init(source VirtualSource) {
    if source == nil { throw ArgumentNullException("source") }
    this.source = source
    Accessibility = Accessibility{ Role: AccessibilityRole.List }
    Position = PositionType.Relative
    OverflowX = Overflow.Scroll
    OverflowY = Overflow.Scroll
  }
}

/// Supplies the inputs of one build of a Virtual element. Implementations must be immutable.
public interface VirtualSource {
  /// Returns the state that places the items of this source.
  /// @param current The state that the element retained from its previous build, or nil for a new element.
  /// @returns `current` with the inputs of this source pending when it can continue from them, else a new state.
  func State(current VirtualState?) VirtualState;
}

/// Places the items of one mounted Virtual element. Goo retains one state for each element.
public open class VirtualState {
  /// Adds each item to mount and sets the content size. All changes, including the inputs that
  /// VirtualSource.State supplied, must stay pending until Commit.
  /// @param viewport The element geometry and its mounted items. Valid only during this call.
  /// @param output Receives the items, the content size, the item count, and an optional scroll offset.
  public open func Realize(viewport VirtualViewport, output VirtualOutput);

  /// Reports whether the committed items no longer agree with the viewport, such as after a scroll or a layout.
  /// Goo then calls Realize again in the same frame, and in the next frame while the result stays true.
  /// @param viewport The element geometry and its mounted items. Valid only during this call.
  /// @returns True when Realize must run again.
  public open func NeedsRealize(viewport VirtualViewport) bool;

  /// Returns the scroll offset that puts an item at the start of the viewport. ElementHandle.ScrollToItem uses it.
  /// @param viewport The element geometry and its mounted items. Valid only during this call.
  /// @param key The stable key of the item.
  /// @returns The scroll offset, or nil for an unknown key.
  public open func OffsetOf(viewport VirtualViewport, key string) Point ? -> nil

  /// Makes the result of the last Realize current. Goo calls it after the items are mounted.
  public open func Commit() { }

  /// Discards the result of the last Realize and all pending inputs. Goo calls it when the items fail to mount.
  public open func Cancel() { }

  /// Releases the state when the element unmounts or when a different state replaces this one.
  public open func Dispose() { }
}

/// Describes a mounted item of a Virtual element.
public data struct VirtualChild {
  private var key string
  private var size LayoutSize
  private var measured bool
  /// Gets the stable key of the item.
  public prop Key string{ get -> key; init -> key = value }
  /// Gets the size of the item from its last layout.
  public prop Size LayoutSize{ get -> size; init -> size = value }
  /// Gets whether Size is the result of a layout of the current content.
  public prop Measured bool{ get -> measured; init -> measured = value }
}

/// Places one item of a Virtual element.
public data struct VirtualItem {
  private var key string
  private var index int32
  private var x float64
  private var y float64
  private var width float64?
  private var height float64?
  private var content Blob?
  /// Gets the stable, nonempty key, unique among the items of one Realize call.
  public prop Key string{ get -> key; init -> key = value }
  /// Gets the zero-based position of the item in the whole collection, for accessibility.
  public prop Index int32{ get -> index; init -> index = value }
  /// Gets the horizontal content coordinate.
  public prop X float64{ get -> x; init -> x = value }
  /// Gets the vertical content coordinate.
  public prop Y float64{ get -> y; init -> y = value }
  /// Gets the width. Nil takes the width from the content.
  public prop Width float64? { get -> width; init -> width = value }
  /// Gets the height. Nil takes the height from the content.
  public prop Height float64? { get -> height; init -> height = value }
  /// Gets the content to mount. Nil keeps the content that is mounted for this key.
  public prop Content Blob? { get -> content; init -> content = value }
}

/// Describes a Virtual element to its state. Access outside the call that receives it throws.
public class VirtualViewport {
  private var node Node?
  private var focused int32

  internal init() { }

  internal func Bind(n Node?) Node? {
    let previous = node
    node = n
    focused = -2
    return previous
  }

  private func bound() Node {
    guard let n = node else { throw InvalidOperationException("VirtualViewport is valid only during a VirtualState call") }
    return n
  }

  /// Gets the size of the visible content area.
  public prop Size LayoutSize{
    get {
      let n = bound()
      return LayoutSize{ Width: float64(BoxGeometry.ViewportWidth(n)), Height: float64(BoxGeometry.ViewportHeight(n)) }
    }
  }
  /// Gets the current scroll offset.
  public prop ScrollOffset Point{
    get {
      let n = bound()
      return Point{ X: float64(n.ScrollX), Y: float64(n.ScrollY) }
    }
  }
  /// Gets the resolved gap between rows.
  public prop RowGap float64{
    get {
      let n = bound()
      return float64(virtualGap(n.RowGap, n.Gap, BoxGeometry.ViewportWidth(n)))
    }
  }
  /// Gets the resolved gap between columns.
  public prop ColumnGap float64{
    get {
      let n = bound()
      return float64(virtualGap(n.ColumnGap, n.Gap, BoxGeometry.ViewportWidth(n)))
    }
  }
  /// Gets the authored flex direction.
  public prop Direction FlexDirection{ get -> bound().FlexDirection }
  /// Gets the authored flex wrap.
  public prop Wrap FlexWrap{ get -> bound().FlexWrap }
  /// Gets whether PinToBottom is set and the reader has not scrolled away from the end.
  public prop Pinned bool{
    get {
      let n = bound()
      return n.PinToBottom && !n.UserScrolled
    }
  }
  /// Gets the number of mounted items.
  public prop ChildCount int32{ get -> bound().Children.Count }
  /// Gets the index of the mounted item that contains keyboard focus, or -1.
  public prop FocusedChild int32{
    get {
      let n = bound()
      if focused == -2 {
        focused = -1
        for i in 0 ... n.Children.Count {
          if virtualHasFocus(n.Children[i]) {
            focused = i
            break
          }
        }
      }
      return focused
    }
  }

  /// Gets a mounted item.
  /// @param index The zero-based index, in the order of the last committed Realize.
  /// @returns The key and the last layout size of the item.
  public func Child(index int32) VirtualChild {
    let child = bound().Children[index]
    var measured = false
    if let yoga = child.Yoga { measured = !YGNodeAPI.YGNodeIsDirty(yoga) }
    return VirtualChild{
      Key: child.Key ?? "",
      Size: LayoutSize{ Width: float64(child.Rect.W), Height: float64(child.Rect.H) },
      Measured: measured,
    }
  }
}

/// Receives the result of a VirtualState.Realize call. Access outside that call throws.
public class VirtualOutput {
  private var owner VirtualNodeState?
  private var contentSize LayoutSize
  private var itemCount int32
  private var scrollOffset Point?

  internal init() { }

  internal func Bind(state VirtualNodeState?) {
    owner = state
    contentSize = LayoutSize{}
    itemCount = 0
    scrollOffset = nil
  }

  private func bound() VirtualNodeState {
    guard let state = owner else { throw InvalidOperationException("VirtualOutput is valid only during VirtualState.Realize") }
    return state
  }

  /// Gets or sets the finite, nonnegative size of the whole content, which sets the scroll range.
  public prop ContentSize LayoutSize{
    get -> contentSize
    set {
      bound()
      contentSize = value
    }
  }
  /// Gets or sets the number of items in the whole collection, for accessibility.
  public prop ItemCount int32{
    get -> itemCount
    set {
      bound()
      itemCount = value
    }
  }
  /// Gets or sets the scroll offset to apply together with the items. Nil keeps the current offset.
  /// A scroll in progress keeps its remaining distance.
  public prop ScrollOffset Point? {
    get -> scrollOffset
    set {
      bound()
      scrollOffset = value
    }
  }

  /// Adds an item to mount. Goo places it, keys it, and gives it the list item role.
  /// @param item The key, the position in the collection, the content box, and the content.
  public func Add(item VirtualItem) { bound().Add(item) }
}

internal func virtualHasFocus(n Node) bool {
  if n.Focused { return true }
  for i in 0 ... n.Children.Count { if virtualHasFocus(n.Children[i]) { return true } }
  return false
}
