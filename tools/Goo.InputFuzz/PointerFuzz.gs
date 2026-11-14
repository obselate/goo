import Goo
import System

internal class PointerFuzz {
    private class Contact {
        internal var Held bool
        internal var Button PointerButton
        internal var Primary bool
        internal var Capture int32 = -1
        internal var Active int32 = -1
        internal var Click int32 = -1
        internal var Drag bool
        internal var Started bool
        internal var Pan bool
        internal var Panning bool
        internal var X float32
        internal var Y float32
        internal var PanY float32
        internal var LastTarget int32 = -1
        internal var LastButton PointerButton
        internal var LastTime float64 = -10
        internal var LastX float32
        internal var LastY float32
        internal var Count int32
        internal var Identity PointerContact?
    }

    private let contacts[]Contact = []Contact{Contact(), Contact(), Contact(), Contact()}
    private let parents[]int32 = []int32{-1, 0, 1, 0, 3, 4, 0, 0}
    private let hovered[]bool = [8]bool
    private var nodes[]Node
    private var operation int32
    private var time float64 = 1
    private var touchSequence bool
    private var primaryTouch int32 = -1
    private var dragOwner int32 = -1
    private var scroll float32
    private var scrollTarget float32
    private var expectedMask int32
    private var observedMask int32
    private var expectedKind PointerEventKind
    private var expectedCount int32
    private var expectedMoveMask int32
    private var observedMoveMask int32
    private var expectedContact int32
    private var expectedCapture int32
    private var expectedClick int32 = -1
    private var observedClick int32 = -1
    private var expectedPhase GesturePhase
    private var expectDrag bool
    private var observedDrag bool
    private var hoverMask int32

    shared {
        internal func Run(input[]uint8) -> PointerFuzz().RunEvents(input)
    }

    private func Require(value bool, invariant string) {
        if !value {
            throw InvalidOperationException("pointer operation $operation: $invariant")
        }
    }

    private func Path(target int32) int32 {
        var mask = 0
        var current = target
        while current >= 0 {
            mask |= 1 << current
            current = parents[current]
        }
        return mask
    }

    private func Hit(x float32, y float32) int32 {
        if x < 0 || x >= 300 || y < 0 || y >= 220 {
            return -1
        }
        if x < 100 && y >= 120 && y < 180 {
            return 7
        }
        if x >= 40 && x < 100 && y >= 20 && y < 60 {
            return 6
        }
        if x >= 140 && x < 260 && y < 100 {
            return x < 200 && y + scroll < 40 ? 5: 4
        }
        if x < 120 && y < 80 {
            return x < 60 && y < 40 ? 2: 1
        }
        return 0
    }

    private func Observe(index int32, kind PointerEventKind, event PointerEvent) {
        let bit = 1 << index
        if kind == PointerEventKind.Move && expectedKind == PointerEventKind.Cancel {
            Require((expectedMoveMask & bit) != 0 && (observedMoveMask & bit) == 0, "move before scroll claim")
            observedMoveMask |= bit
        } else {
            Require(
                kind == expectedKind && (expectedMask & bit) != 0 && (observedMask & bit) == 0,
                "routed path, handler $index, actual $kind, expected $expectedKind, mask $expectedMask"
            )
            observedMask |= bit
        }
        let contact = event.Device == PointerDevice.Mouse ? 0: int32(event.PointerId) + 1
        Require(contact == expectedContact, "pointer identity")
        Require(event.ClickCount == expectedCount, "click sequence count")
        let capture = event.Control?.CaptureOwner
        Require(expectedCapture < 0 ? capture == nil: capture == nodes[expectedCapture], "capture route")
        if event.Device == PointerDevice.Touch {
            contacts[contact].Identity = event.Identity
        }
        if kind == PointerEventKind.Press && index == 7 {
            event.Capture()
        }
    }

    private func Hover(index int32, enter bool, event PointerEvent) {
        Require(event.Device == PointerDevice.Mouse && event.PointerId == 0, "mouse-only hover identity")
        Require(hovered[index] != enter, "hover enter/leave alternation")
        hovered[index] = enter
    }

    private func RunEvents(input[]uint8) {
        let blobs = []Container{
            Container{Width: 300, Height: 220},
            Container{Position: PositionType.Absolute, Width: 120, Height: 80},
            Container{Width: 60, Height: 40},
            Container{Position: PositionType.Absolute, Left: 140, Width: 120, Height: 100, OverflowY: Overflow.Scroll},
            Container{
                Width: 120,
                Height: 300,
                FlexShrink: 0,
                PointerDragThreshold: 8,
                PointerDragAxis: LayoutAxis.Horizontal
            },
            Container{Width: 60, Height: 40},
            Container{Position: PositionType.Absolute, Left: 40, Top: 20, Width: 60, Height: 40},
            Container{Position: PositionType.Absolute, Top: 120, Width: 100, Height: 60},
        }
        for i in 0 ... blobs.Length {
            let index = i
            let blob = blobs[index]
            blob.OnPointerDown = (event PointerEvent) -> Observe(index, PointerEventKind.Press, event)
            blob.OnPointerMove = (event PointerEvent) -> Observe(index, PointerEventKind.Move, event)
            blob.OnPointerUp = (event PointerEvent) -> Observe(index, PointerEventKind.Release, event)
            blob.OnPointerCancel = (event PointerEvent) -> Observe(index, PointerEventKind.Cancel, event)
            blob.OnPointerEnter = (event PointerEvent) -> Hover(index, true, event)
            blob.OnPointerLeave = (event PointerEvent) -> Hover(index, false, event)
            blob.OnClick = () -> {
                Require(observedClick < 0, "one click callback per release")
                observedClick = index
            }
            blob.OnWheel = (event WheelEvent) -> {
                let bit = 1 << index
                Require(
                    expectedKind == PointerEventKind.Wheel && (expectedMask & bit) != 0
                    && (observedMask & bit) == 0,
                    "wheel callback route"
                )
                observedMask |= bit
                event.PreventDefault()
            }
            if index > 0 {
                let parent = blobs[parents[index]]
                parent.Children.Add(blob)
            }
        }
        blobs[4].OnPointerDrag = (event PointerDragEvent) -> {
            Require(expectDrag && !observedDrag && event.Phase == expectedPhase, "pointer drag phase")
            Require(
                event.Phase != GesturePhase.Started || Math.Abs(event.Translation.X) >= 8,
                "horizontal pointer drag threshold"
            )
            observedDrag = true
        }
        let resolver = Resolver()
        let root = Reconciler{Res: resolver}.Mount(blobs[0])
        let layout = Layout()
        let focus = FocusManager()
        let pointer = PointerInput(focus, InputEventQueue())
        let text = TextInput(focus)
        nodes = []Node{
            root,
            root.Children[0],
            root.Children[0].Children[0],
            root.Children[1],
            root.Children[1].Children[0],
            root.Children[1].Children[0].Children[0],
            root.Children[2],
            root.Children[3]
        }
        try {
            layout.Calculate(root, 300, 220)
            var offset = 0
            while offset < input.Length && operation < 128 {
                let code = int32(input[offset])
                offset++
                let x = offset < input.Length ? float32(int32(input[offset]) % 80 * 4 - 8): 0.0F
                if offset < input.Length {
                    offset++
                }
                let y = offset < input.Length ? float32(int32(input[offset]) % 60 * 4 - 8): 0.0F
                if offset < input.Length {
                    offset++
                }
                let delta = offset < input.Length ? int32(input[offset]): 0
                if offset < input.Length {
                    offset++
                }
                time += float64(delta) * 0.002
                let contact = (code & 8) == 0 ? 0: 1 + (code >> 4) % 3
                let button = contact == 0 ? PointerButton(1 + (code >> 5) % 5): PointerButton.Primary
                var kind = switch code % 5 {
                    case 0: PointerEventKind.Move
                    case 1: PointerEventKind.Press
                    case 2: PointerEventKind.Release
                    case 3: PointerEventKind.Cancel
                    case _: PointerEventKind.Wheel
                }
                if kind == PointerEventKind.Press && contacts[contact].Held {
                    kind = PointerEventKind.Release
                }
                if kind == PointerEventKind.Release && !contacts[contact].Held {
                    kind = PointerEventKind.Move
                }
                Send(pointer, text, resolver, root, layout, contact, kind, x, y, button)
            }
            for contact in 0 ... contacts.Length {
                Send(
                    pointer,
                    text,
                    resolver,
                    root,
                    layout,
                    contact,
                    PointerEventKind.Cancel,
                    0,
                    0,
                    PointerButton.Primary
                )
            }
            Require(!pointer.RetainsInteraction(root), "all captures and interactions released")
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }

    private func Send(
        pointer PointerInput,
        text TextInput,
        resolver Resolver,
        root Node,
        layout Layout,
        id int32,
        kind PointerEventKind,
        x float32,
        y float32,
        button PointerButton
    ) {
        let state = contacts[id]
        let exists = id == 0 || state.Held
        let hit = Hit(x, y)
        expectedContact = id
        expectedCapture = state.Capture
        expectedKind = kind
        expectedMask = 0
        observedMask = 0
        expectedClick = -1
        expectedMoveMask = 0
        observedMoveMask = 0
        observedClick = -1
        expectDrag = false
        observedDrag = false
        expectedCount = 0
        if kind == PointerEventKind.Wheel && exists {
            expectedMask = Path(hit)
        }
        if kind == PointerEventKind.Press {
            state.Button = button
            state.Held = true
            state.Active = hit
            state.Primary = id == 0
            if id > 0 && !touchSequence {
                touchSequence = true
                primaryTouch = id
            }
            if id > 0 {
                state.Primary = primaryTouch == id
            }
            let repeated = hit >= 0 && hit == state.LastTarget && button == state.LastButton
            && time - state.LastTime < 0.4 && MathF.Abs(x - state.LastX) < 4
            && MathF.Abs(y - state.LastY) < 4
            state.Count = repeated ? Math.Min(3, state.Count + 1): 1
            state.LastTarget = hit
            state.LastButton = button
            state.LastTime = time
            state.LastX = x
            state.LastY = y
            state.X = x
            state.Y = y
            state.PanY = y
            expectedCount = state.Count
            expectedMask = Path(hit)
            state.Click = button == PointerButton.Primary && state.Primary ? hit: -1
            if hit == 7 {
                state.Capture = 7
            }
            if button == PointerButton.Primary && (Path(hit) & (1 << 4)) != 0 {
                if dragOwner < 0 {
                    dragOwner = id
                    state.Drag = true
                }
                state.Pan = id > 0 && state.Primary
                if state.Pan {
                    scrollTarget = scroll
                }
            }
        } else if kind == PointerEventKind.Cancel {
            if exists && state.Held {
                expectedMask = Path(state.Capture >= 0 ? state.Capture: state.Active)
                if state.Started {
                    expectDrag = true
                    expectedPhase = GesturePhase.Canceled
                }
            }
            state.LastTarget = -1
            state.Count = 0
        } else if (kind == PointerEventKind.Move || kind == PointerEventKind.Release) && exists {
            let pan = state.Panning ||
                (
                kind == PointerEventKind.Move && state.Pan
                && state.Capture < 0 && MathF.Abs(y - state.Y) >= 8
            )
            if pan {
                if !state.Panning {
                    expectedKind = PointerEventKind.Cancel
                    if !state.Drag {
                        expectedMoveMask = Path(hit)
                    }
                    expectedMask = Path(state.Active)
                    state.Drag = false
                    if dragOwner == id {
                        dragOwner = -1
                    }
                    state.Active = -1
                    state.Click = -1
                    state.Panning = true
                }
                scroll = Math.Clamp(scroll + state.PanY - y, 0.0F, 200.0F)
                scrollTarget = scroll
                state.PanY = y
            } else {
                let target = state.Capture >= 0 ? state.Capture: state.Drag && !state.Started ? state.Active: hit
                expectedMask = Path(target)
                if MathF.Abs(x - state.LastX) >= 4 || MathF.Abs(y - state.LastY) >= 4 {
                    state.LastTarget = -1
                }
                if kind == PointerEventKind.Release && hit != state.LastTarget {
                    state.LastTarget = -1
                }
                if kind == PointerEventKind.Release {
                    expectedCount = state.Count
                }
                if state.Drag {
                    if !state.Started && kind == PointerEventKind.Move && MathF.Abs(x - state.X) >= 8 {
                        state.Started = true
                        state.Capture = 4
                        state.Click = -1
                        state.LastTarget = -1
                        expectedPhase = GesturePhase.Started
                        expectDrag = true
                    } else if state.Started {
                        expectedPhase = kind == PointerEventKind.Release ? GesturePhase.Completed: GesturePhase.Changed
                        expectDrag = true
                        state.LastTarget = -1
                    }
                }
                if kind == PointerEventKind.Release && state.Button == PointerButton.Primary && state.Primary
                && (Path(hit) & Path(state.Click)) == Path(state.Click) && state.Click >= 0 {
                    expectedClick = state.Click
                }
                if kind == PointerEventKind.Move && id == 0 {
                    hoverMask = Path(hit)
                }
            }
        }
        if expectedKind == PointerEventKind.Cancel {
            expectedCapture = -1
        }
        let actualButton = kind == PointerEventKind.Release ? state.Button: button
        pointer.Dispatch(
            QueuedPointerEvent{
                Kind: kind,
                PointerId: id == 0 ? 0: int64(id - 1),
                Device: id == 0 ? PointerDevice.Mouse: PointerDevice.Touch,
                X: x,
                Y: y,
                Button: actualButton,
                ReceivedTime: time,
                DY: 1,
            },
            root,
            resolver,
            time,
            text
        )
        Require(observedMask == expectedMask, "complete routed callback path")
        Require(observedMoveMask == expectedMoveMask, "complete move path before scroll claim")
        Require(observedClick == expectedClick, "click callback target and suppression")
        Require(observedDrag == expectDrag, "pointer drag recognition")
        if kind == PointerEventKind.Release || kind == PointerEventKind.Cancel {
            state.Held = false
            state.Capture = -1
            state.Active = -1
            state.Click = -1
            state.Drag = false
            state.Started = false
            state.Pan = false
            state.Panning = false
            if dragOwner == id {
                dragOwner = -1
            }
            if primaryTouch == id {
                primaryTouch = -1
            }
            if id > 0 {
                state.LastTarget = -1
                state.Count = 0
            }
        }
        var anyHeld = false
        var touchHeld = false
        for i in 0 ... contacts.Length {
            anyHeld = anyHeld || contacts[i].Held
            touchHeld = touchHeld || i > 0 && contacts[i].Held
            if let identity = contacts[i].Identity {
                let capture = contacts[i].Capture
                Require(
                    capture < 0 ? identity.CaptureTarget == nil: identity.CaptureTarget == nodes[capture],
                    "per-contact capture released on up or cancel"
                )
            }
        }
        if !touchHeld {
            touchSequence = false
        }
        if !anyHeld {
            Require(!pointer.RetainsInteraction(root), "capture released while pointers are up")
        }
        Require(
            nodes[3].ScrollY == scroll && nodes[3].ScrollTargetY == scrollTarget,
            "vertical scroll arbitration and offset"
        )
        for i in 0 ... nodes.Length {
            Require(
                hovered[i] == ((hoverMask & (1 << i)) != 0) && nodes[i].Hovered == hovered[i],
                "hover route and retained state"
            )
        }
        layout.RefreshScrollPlacement(root, root)
        resolver.Flush()
        operation++
    }
}
