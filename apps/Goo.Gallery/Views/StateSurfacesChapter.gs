package GooGallery

import Goo
import System
import System.Collections.Generic

class StateSurfacesChapter : Cell {
    /// Gets or sets whether this chapter uses compact sizing.
    public var Compact bool
    internal prop Active bool {
        get -> active
        set {
            if active == value {
                return
            }
            active = value
            if active {
                resumeAct(activeAct)
            } else {
                pauseAct(activeAct)
            }
            Rebuild()
        }
    }

    private let phrase string
    private let letters List[GallerySurfaceLetter]
    private let alphabet GalleryHandAlphabet
    private let stageHandle ElementHandle
    private let actProgress Anim[float64]
    private let restoreProgress Anim[float64]
    private let drawerProgress Anim[float64]
    private let inkProgress Anim[float64]
    private let cipherProgress Anim[float64]
    private let cipherSteps List[GalleryCipherStep]
    private let cipherTexts List[string]
    private var active bool
    private var activeAct int32
    private var restoring bool
    private var drawerDropping bool
    private var drawerRound int32
    private var inkStarted bool
    private var cipherStarted bool
    private var dragId int32
    private var dragOffset Point

    shared {
        let MagnetShadows[]BoxShadow = []BoxShadow{
            BoxShadow{
                OffsetX: 0.0,
                OffsetY: 7.0,
                Blur: 10.0,
                Spread: -2.0,
                Color: Color.Rgba(0, 0, 0, 115),
                Inset: false
            },
            BoxShadow{
                OffsetX: 0.0,
                OffsetY: 1.0,
                Blur: 2.0,
                Spread: 0.0,
                Color: Color.Rgba(255, 255, 255, 100),
                Inset: true
            },
        }
    }

    public init() {
        phrase = "State across surface"
        dragId = -1
        dragOffset = Point{}
        alphabet = GalleryHandAlphabet()
        stageHandle = ElementHandle{}
        actProgress = Animate(1.0)
        restoreProgress = Animate(0.0)
        drawerProgress = Animate(0.0)
        inkProgress = Animate(0.0)
        cipherProgress = Animate(0.0)
        letters = List[GallerySurfaceLetter]()
        var sourceIndex int32 = 0
        var letterId int32 = 0
        while sourceIndex < phrase.Length {
            let character = phrase[sourceIndex]
            if character != ' ' {
                let x = 0.08 + float64((letterId * 37 + 11) % 83) / 100.0
                let y = 0.57 + float64((letterId * 23 + 3) % 13) / 100.0
                let rotation = -18.0 + float64((letterId * 31 + 7) % 37)
                letters.Add(GallerySurfaceLetter(letterId, sourceIndex, character, Point{X: x, Y: y}, rotation))
                letterId = letterId + 1
            }
            sourceIndex = sourceIndex + 1
        }
        cipherSteps = List[GalleryCipherStep]()
        cipherTexts = List[string]()
        buildCipher()
    }

    private func cipherSlots(permutation[]int32)[]int32 {
        let slots = [18]int32{}
        var slot int32 = 0
        while slot < 18 {
            slots[permutation[slot]] = slot
            slot = slot + 1
        }
        return slots
    }

    private func recordCipher(permutation[]int32) {
        var slot int32 = 0
        var text = ""
        while slot < 18 {
            let letterId = permutation[slot]
            text = text + letters[letterId].Character.ToString()
            if slot == 4 || slot == 10 {
                text = text + " "
            }
            slot = slot + 1
        }
        cipherTexts.Add(text)
    }

    private func buildCipher() {
        let permutation = [18]int32{}
        var index int32 = 0
        while index < 18 {
            permutation[index] = (index * 7 + 5) % 18
            index = index + 1
        }
        recordCipher(permutation)
        var source int32 = 1
        while source < 18 {
            let movingId = permutation[source]
            var destination = source
            while destination > 0 && permutation[destination - 1] > movingId {
                destination = destination - 1
            }
            if destination != source {
                let before = cipherSlots(permutation)
                var slot = source
                while slot > destination {
                    permutation[slot] = permutation[slot - 1]
                    slot = slot - 1
                }
                permutation[destination] = movingId
                let after = cipherSlots(permutation)
                cipherSteps.Add(GalleryCipherStep(before, after, movingId, source, destination))
                recordCipher(permutation)
            }
            source = source + 1
        }
    }

    private func sourceX(sourceIndex int32) float64 ->
    0.08 + float64(sourceIndex) * 0.84 / float64(phrase.Length - 1)

    private func cipherX(slot int32) float64 {
        let sourceSlot = if slot < 5 {
            slot
        } else {
            if slot < 11 {
                slot + 1
            } else {
                slot + 2
            }
        }
        return sourceX(sourceSlot)
    }

    private func fridgeTarget(letter GallerySurfaceLetter) Point ->
    Point{X: sourceX(letter.SourceIndex), Y: 0.34}

    private func inkTarget(letter GallerySurfaceLetter) Point ->
    Point{X: sourceX(letter.SourceIndex), Y: 0.46}

    private func cipherTarget(letter GallerySurfaceLetter) Point {
        if cipherSteps.Count == 0 {
            return Point{X: sourceX(letter.SourceIndex), Y: 0.38}
        }
        let scaled = cipherProgress.Value * float64(cipherSteps.Count)
        var stepIndex = int32(Math.Floor(scaled))
        var local = scaled - float64(stepIndex)
        if stepIndex >= cipherSteps.Count {
            stepIndex = cipherSteps.Count - 1
            local = 1.0
        }
        let step = cipherSteps[stepIndex]
        if letter.Id == step.MovingId {
            let eased = local * local * (3.0 - 2.0 * local)
            return Point{
                X: cipherX(step.FromSlot)
                + (cipherX(step.ToSlot) - cipherX(step.FromSlot)) * eased,
                Y: 0.38 + Math.Sin(eased * Math.PI) * 0.22,
            }
        }
        let shift = Math.Clamp((local - 0.28) / 0.44, 0.0, 1.0)
        let eased = shift * shift * (3.0 - 2.0 * shift)
        let fromSlot = step.BeforeSlots[letter.Id]
        let toSlot = step.AfterSlots[letter.Id]
        return Point{X: cipherX(fromSlot) + (cipherX(toSlot) - cipherX(fromSlot)) * eased, Y: 0.38,}
    }

    private func restoreLocal(letter GallerySurfaceLetter) float64 {
        let delay = float64(letter.Id) * 0.38 / float64(letters.Count - 1)
        return Math.Clamp((restoreProgress.Value - delay) / 0.62, 0.0, 1.0)
    }

    private func drawerLocal(letter GallerySurfaceLetter) float64 {
        let delay = float64(letter.DrawerRank) * 0.42 / float64(letters.Count - 1)
        return Math.Clamp((drawerProgress.Value - delay) / 0.58, 0.0, 1.0)
    }

    private func fridgePosition(letter GallerySurfaceLetter) Point {
        if restoring {
            let local = restoreLocal(letter)
            let eased = 1.0 - Math.Pow(1.0 - local, 3.0)
            + Math.Sin(local * Math.PI) * 0.08 * (1.0 - local)
            let target = fridgeTarget(letter)
            return Point{
                X: letter.RestoreFrom.X + (target.X - letter.RestoreFrom.X) * eased,
                Y: letter.RestoreFrom.Y + (target.Y - letter.RestoreFrom.Y) * eased,
            }
        }
        if drawerDropping {
            let local = drawerLocal(letter)
            let lateral = local * local * (3.0 - 2.0 * local)
            let fall = local * local
            return Point{
                X: letter.RestoreFrom.X
                + (letter.DrawerTarget.X - letter.RestoreFrom.X) * lateral,
                Y: letter.RestoreFrom.Y
                + (letter.DrawerTarget.Y - letter.RestoreFrom.Y) * fall,
            }
        }
        return letter.Magnet
    }

    private func fridgeRotation(letter GallerySurfaceLetter) float64 {
        if restoring {
            let local = restoreLocal(letter)
            let eased = local * local * (3.0 - 2.0 * local)
            return letter.RestoreRotation * (1.0 - eased)
        }
        if drawerDropping {
            let local = drawerLocal(letter)
            let eased = local * local * (3.0 - 2.0 * local)
            return letter.RestoreRotation
            + (letter.DrawerRotation - letter.RestoreRotation) * eased
        }
        return letter.MagnetRotation
    }

    private func actPosition(letter GallerySurfaceLetter, act int32) Point {
        if act == 0 {
            return fridgePosition(letter)
        }
        if act == 1 {
            return inkTarget(letter)
        }
        return cipherTarget(letter)
    }

    private func actRotation(letter GallerySurfaceLetter, act int32) float64 {
        if act == 0 {
            return fridgeRotation(letter)
        }
        if act == 1 {
            return -2.0 + float64(letter.Id % 5)
        }
        return 0.0
    }

    private func actScale(act int32) float64 {
        if act == 0 {
            return 1.0
        }
        if act == 1 {
            return 1.08
        }
        return 0.92
    }

    private func transitionEase() float64 {
        let value = Math.Clamp(actProgress.Value, 0.0, 1.0)
        return value * value * (3.0 - 2.0 * value)
    }

    private func displayPosition(letter GallerySurfaceLetter) Point {
        let target = actPosition(letter, activeAct)
        let eased = transitionEase()
        return Point{
            X: letter.TransitionFrom.X + (target.X - letter.TransitionFrom.X) * eased,
            Y: letter.TransitionFrom.Y + (target.Y - letter.TransitionFrom.Y) * eased,
        }
    }

    private func displayRotation(letter GallerySurfaceLetter) float64 {
        let target = actRotation(letter, activeAct)
        let eased = transitionEase()
        return letter.TransitionRotation + (target - letter.TransitionRotation) * eased
    }

    private func displayScale(letter GallerySurfaceLetter) float64 {
        let target = actScale(activeAct)
        let eased = transitionEase()
        return letter.TransitionScale + (target - letter.TransitionScale) * eased
    }

    private func syncFridgeMotion() {
        if restoring && restoreProgress.Value >= 0.9999 {
            var index int32 = 0
            while index < letters.Count {
                letters[index].Magnet = fridgeTarget(letters[index])
                letters[index].MagnetRotation = 0.0
                index = index + 1
            }
            restoring = false
        }
        if drawerDropping && drawerProgress.Value >= 0.9999 {
            var index int32 = 0
            while index < letters.Count {
                letters[index].Magnet = letters[index].DrawerTarget
                letters[index].MagnetRotation = letters[index].DrawerRotation
                index = index + 1
            }
            drawerDropping = false
        }
    }

    private func pauseAct(act int32) {
        if act == 0 && restoring {
            restoreProgress.Set(restoreProgress.Value)
        } else if act == 0 && drawerDropping {
            drawerProgress.Set(drawerProgress.Value)
        } else if act == 1 && inkStarted && inkProgress.Value < 1.0 {
            inkProgress.Set(inkProgress.Value)
        } else if act == 2 && cipherStarted && cipherProgress.Value < 1.0 {
            cipherProgress.Set(cipherProgress.Value)
        }
    }

    private func resumeAct(act int32) {
        if !active {
            return
        }
        if act == 0 && restoring {
            restoreProgress.To(1.0, GalleryRestoreSpec)
        } else if act == 0 && drawerDropping {
            drawerProgress.To(1.0, GalleryRestoreSpec)
        } else if act == 1 {
            inkStarted = true
            if inkProgress.Value < 1.0 {
                inkProgress.To(1.0, GalleryPerformanceSpec)
            }
        } else if act == 2 {
            cipherStarted = true
            if cipherProgress.Value < 1.0 {
                cipherProgress.To(1.0, GalleryPerformanceSpec)
            }
        }
    }

    private func switchAct(next int32) {
        if next == activeAct {
            return
        }
        syncFridgeMotion()
        var index int32 = 0
        while index < letters.Count {
            let letter = letters[index]
            letter.TransitionFrom = displayPosition(letter)
            letter.TransitionRotation = displayRotation(letter)
            letter.TransitionScale = displayScale(letter)
            index = index + 1
        }
        pauseAct(activeAct)
        dragId = -1
        activeAct = next
        actProgress.Set(0.0)
        actProgress.To(1.0, GalleryActTransitionSpec)
        resumeAct(activeAct)
        Rebuild()
    }

    private func restoreMagnets() {
        cancelFridgeMotion()
        var index int32 = 0
        while index < letters.Count {
            letters[index].RestoreFrom = letters[index].Magnet
            letters[index].RestoreRotation = letters[index].MagnetRotation
            index = index + 1
        }
        restoring = true
        restoreProgress.Set(0.0)
        if active {
            restoreProgress.To(1.0, GalleryRestoreSpec)
        }
        Rebuild()
    }

    private func drawerMagnets() {
        cancelFridgeMotion()
        drawerRound = drawerRound + 1
        let order = [18]int32{}
        var index int32 = 0
        while index < order.Length {
            order[index] = index
            index = index + 1
        }
        index = order.Length - 1
        while index > 0 {
            let swapIndex = (drawerRound * 97 + index * 53 + 11) % (index + 1)
            let swap = order[index]
            order[index] = order[swapIndex]
            order[swapIndex] = swap
            index = index - 1
        }
        var rank int32 = 0
        while rank < order.Length {
            let letter = letters[order[rank]]
            letter.RestoreFrom = letter.Magnet
            letter.RestoreRotation = letter.MagnetRotation
            letter.DrawerRank = rank
            let column = rank % 9
            let row = rank / 9
            let jitter = float64((drawerRound * 19 + rank * 23) % 5 - 2) / 250.0
            letter.DrawerTarget = Point{
                X: 0.10 + float64(column) * 0.10 + jitter,
                Y: 0.79 + float64(row) * 0.095
                + float64((drawerRound * 13 + rank * 7) % 3) / 300.0,
            }
            letter.DrawerRotation = -20.0
            + float64((drawerRound * 29 + rank * 31) % 41)
            rank = rank + 1
        }
        drawerDropping = true
        drawerProgress.Set(0.0)
        if active {
            drawerProgress.To(1.0, GalleryRestoreSpec)
        }
        Rebuild()
    }

    private func cancelFridgeMotion() {
        if !restoring && !drawerDropping {
            return
        }
        var index int32 = 0
        while index < letters.Count {
            letters[index].Magnet = fridgePosition(letters[index])
            letters[index].MagnetRotation = fridgeRotation(letters[index])
            index = index + 1
        }
        restoreProgress.Set(restoreProgress.Value)
        drawerProgress.Set(drawerProgress.Value)
        restoring = false
        drawerDropping = false
    }

    private func replayInk() {
        inkStarted = true
        inkProgress.Set(0.0)
        if active && activeAct == 1 {
            inkProgress.To(1.0, GalleryPerformanceSpec)
        }
        Rebuild()
    }

    private func replayCipher() {
        cipherStarted = true
        cipherProgress.Set(0.0)
        if active && activeAct == 2 {
            cipherProgress.To(1.0, GalleryPerformanceSpec)
        }
        Rebuild()
    }

    private func stagePoint(windowPosition Point) Point {
        let bounds = stageHandle.BorderBox
        let width = Math.Max(bounds.Width, 1.0)
        let height = Math.Max(bounds.Height, 1.0)
        return Point{
            X: Math.Clamp((windowPosition.X - bounds.X) / width, 0.035, 0.965),
            Y: Math.Clamp((windowPosition.Y - bounds.Y) / height, 0.05, 0.95),
        }
    }

    private func beginMagnetDrag(letter GallerySurfaceLetter, event DragStartEvent) DragData? {
        if activeAct != 0 {
            return nil
        }
        cancelFridgeMotion()
        let pointer = stagePoint(event.WindowPosition)
        dragId = letter.Id
        dragOffset = Point{X: letter.Magnet.X - pointer.X, Y: letter.Magnet.Y - pointer.Y}
        Rebuild()
        return DragData(letter, DragEffect.Move)
    }

    private func dragMagnet(letter GallerySurfaceLetter, event DragEvent) {
        if activeAct != 0 || dragId != letter.Id {
            return
        }
        let pointer = stagePoint(event.WindowPosition)
        letter.Magnet = Point{
            X: Math.Clamp(pointer.X + dragOffset.X, 0.035, 0.965),
            Y: Math.Clamp(pointer.Y + dragOffset.Y, 0.05, 0.95),
        }
        Rebuild()
    }

    private func endMagnetDrag(letter GallerySurfaceLetter, event DragEndEvent) {
        if dragId != letter.Id {
            return
        }
        dragId = -1
        Rebuild()
    }

    private func queryMagnetDrop(event DragEvent) DragEffect {
        if event.Data.Value is GallerySurfaceLetter {
            return DragEffect.Move
        }
        return DragEffect.None
    }

    private func changeMagnetDrop(event DragEvent) {
        if event.Kind == DragEventKind.Leave {
            return
        }
        let payload = event.Data.Value
        if payload is GallerySurfaceLetter {
            dragMagnet(payload, event)
        }
    }

    private func moveMagnet(letter GallerySurfaceLetter, x float64, y float64) {
        cancelFridgeMotion()
        letter.Magnet = Point{X: Math.Clamp(x, 0.035, 0.965), Y: Math.Clamp(y, 0.05, 0.95),}
        Rebuild()
    }

    private func nudgeMagnet(letter GallerySurfaceLetter, event KeyEvent) {
        if activeAct != 0 {
            return
        }
        let dx = if event.Key == Key.Left {
            -0.02
        } else {
            if event.Key == Key.Right {
                0.02
            } else {
                0.0
            }
        }
        let dy = if event.Key == Key.Up {
            -0.02
        } else {
            if event.Key == Key.Down {
                0.02
            } else {
                0.0
            }
        }
        if dx == 0.0 && dy == 0.0 {
            return
        }
        event.PreventDefault()
        moveMagnet(letter, letter.Magnet.X + dx, letter.Magnet.Y + dy)
    }

    private func moveMagnetAccessible(letter GallerySurfaceLetter, request AccessibilityActionRequest) bool {
        if activeAct != 0 {
            return false
        }
        if request.Action == AccessibilityAction.Increment {
            moveMagnet(letter, letter.Magnet.X + 0.02, letter.Magnet.Y)
            return true
        }
        if request.Action == AccessibilityAction.Decrement {
            moveMagnet(letter, letter.Magnet.X - 0.02, letter.Magnet.Y)
            return true
        }
        if request.Action == AccessibilityAction.Scroll {
            moveMagnet(letter, request.ScrollX, request.ScrollY)
            return true
        }
        return false
    }

    private func magnetColor(index int32) Color {
        let palette = index % 6
        if palette == 0 {
            return Color.Rgb(238, 72, 69)
        }
        if palette == 1 {
            return Color.Rgb(250, 196, 54)
        }
        if palette == 2 {
            return Color.Rgb(52, 143, 211)
        }
        if palette == 3 {
            return Color.Rgb(69, 178, 112)
        }
        if palette == 4 {
            return Color.Rgb(237, 120, 48)
        }
        return Color.Rgb(151, 91, 190)
    }

    private func magnetFace(letter GallerySurfaceLetter, size float64) Blob -> Container{
        Width: size,
        Height: size,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        BackgroundColor: magnetColor(letter.Id),
        BorderRadius: size * 0.28,
        BorderWidth: 1,
        BorderColor: Color.Rgba(255, 255, 255, 100),
        BoxShadows: MagnetShadows,
        Text{
            Content: letter.Character.ToString(),
            FontSize: size * 0.60,
            FontWeight: 900,
            Color: Color.Rgb(31, 31, 35),
            TextShadows: []TextShadow{
                TextShadow{OffsetX: 0.0, OffsetY: 1.0, Blur: 0.0, Color: Color.Rgba(255, 255, 255, 135)},
            },
        },
    }

    private func inkLocal(letter GallerySurfaceLetter) float64 ->
    Math.Clamp(inkProgress.Value * float64(letters.Count) - float64(letter.Id), 0.0, 1.0)

    private func inkCharacter(
        letter GallerySurfaceLetter,
        size float64,
        left float64,
        top float64,
        opacity float64
    ) Blob -> Container{
        Position: PositionType.Absolute,
        Left: left,
        Top: top,
        Width: size,
        Height: size * 1.35,
        Opacity: opacity,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        Text{
            Content: letter.Character.ToString(),
            FontSize: size * 1.02,
            FontWeight: 520,
            LineHeight: 1.0,
            Color: Color.Rgb(29, 37, 46),
        },
    }

    private func inkFace(letter GallerySurfaceLetter, size float64) Blob {
        let glyph = alphabet.Glyph(letter.Character)
        let progress = inkLocal(letter)
        let pen = glyph.Pen(progress)
        let children = List[Blob]()
        if progress > 0.0 {
            let reveal = glyph.Reveal(progress)
            children.Add(inkCharacter(letter, size, 0.0, 0.0, reveal * reveal * reveal))
            if progress < 1.0 {
                let patchWidth = size * 0.46
                let patchHeight = size * 0.46
                let visible = int32(Math.Ceiling(progress * 10.0))
                var sampleIndex int32 = 1
                while sampleIndex <= visible {
                    let sample = Math.Min(float64(sampleIndex) / 10.0, progress)
                    let track = glyph.Pen(sample)
                    children.Add(
                        Container{
                            Position: PositionType.Absolute,
                            Left: Length.Percent(track.X),
                            Top: Length.Percent(track.Y),
                            Width: patchWidth,
                            Height: patchHeight,
                            OverflowX: Overflow.Hidden,
                            OverflowY: Overflow.Hidden,
                            Transform: PanelTransform{TranslateX: -patchWidth * 0.5, TranslateY: -patchHeight * 0.5,},
                            inkCharacter(
                                letter,
                                size,
                                patchWidth * 0.5 - track.X * size / 100.0,
                                patchHeight * 0.5 - track.Y * size * 1.35 / 100.0,
                                1.0
                            ),
                        }
                    )
                    sampleIndex = sampleIndex + 1
                }
            }
        }
        if progress > 0.0 && progress < 1.0 && activeAct == 1 {
            children.Add(
                Container{
                    Position: PositionType.Absolute,
                    Left: Length.Percent(pen.X),
                    Top: Length.Percent(pen.Y),
                    Width: 7,
                    Height: 7,
                    BorderRadius: 3.5,
                    BackgroundColor: Color.Rgb(54, 66, 78),
                    Transform: PanelTransform{TranslateX: -3.5, TranslateY: -3.5},
                }
            )
        }
        return Container{Width: size, Height: size * 1.35, Position: PositionType.Relative, Children: children,}
    }

    private func cipherFace(letter GallerySurfaceLetter, size float64) Blob -> Container{
        Width: size,
        Height: size,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        BackgroundColor: Color.Rgba(21, 36, 34, 215),
        BorderWidth: 1,
        BorderColor: Color.Rgba(112, 230, 174, 100),
        Text{
            Content: letter.Character.ToString(),
            FontSize: size * 0.70,
            FontWeight: 700,
            Color: Color.Rgb(146, 246, 192),
        },
    }

    private func letterBlob(letter GallerySurfaceLetter) Blob {
        let position = displayPosition(letter)
        let size = if Compact {
            33.0
        } else {
            43.0
        }
        let content = if activeAct == 0 {
            magnetFace(letter, size)
        } else {
            if activeAct == 1 {
                inkFace(letter, size)
            } else {
                cipherFace(letter, size * 0.82)
            }
        }
        return Container{
            Key: "surface-letter-" + letter.Id.ToString(),
            Position: PositionType.Absolute,
            Left: Length.Percent(position.X * 100.0),
            Top: Length.Percent(position.Y * 100.0),
            Width: size,
            Height: if activeAct == 1 {
                size * 1.35
            } else {
                size
            },
            Focusable: activeAct == 0,
            Cursor: if activeAct == 0 {
                Cursor.Move
            } else {
                Cursor.Default
            },
            Accessibility: Accessibility{
                Role: AccessibilityRole.Button,
                Name: "Letter " + letter.Character.ToString(),
                Actions: []AccessibilityAction{
                    AccessibilityAction.Increment,
                    AccessibilityAction.Decrement,
                    AccessibilityAction.Scroll,
                },
                OnAction: (request AccessibilityActionRequest) ->
                moveMagnetAccessible(letter, request),
            },
            Transform: PanelTransform{
                TranslateX: -size * 0.5,
                TranslateY: -size * 0.5,
                Rotate: displayRotation(letter),
                Scale: displayScale(letter),
            },
            DragSource: DragSource(
                (event DragStartEvent) -> beginMagnetDrag(letter, event),
                (event DragEndEvent) -> endMagnetDrag(letter, event)
            ),
            OnKeyDown: (event KeyEvent) -> nudgeMagnet(letter, event),
            content,
        }
    }

    private func fridgeSurface() Blob -> Container{
        Key: "act-surface",
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Right: 0,
        Bottom: 0,
        DropTarget: DropTarget(
            (event DragEvent) -> queryMagnetDrop(event),
            (event DragEvent) -> changeMagnetDrop(event)
        ),
        TransitionMs: 250.0,
        BackgroundColor: Color.Rgb(91, 70, 54),
        Container{
            Position: PositionType.Absolute,
            Left: Length.Percent(3),
            Top: Length.Percent(3),
            Width: Length.Percent(94),
            Height: Length.Percent(61),
            BackgroundGradient: LinearGradient(Color.Rgb(235, 236, 229), Color.Rgb(190, 198, 198)),
            BorderRadius: 18,
            BorderWidth: 2,
            BorderColor: Color.Rgb(159, 168, 169),
            BoxShadows: []BoxShadow{
                BoxShadow{
                    OffsetX: 0.0,
                    OffsetY: 10.0,
                    Blur: 22.0,
                    Spread: -4.0,
                    Color: Color.Rgba(0, 0, 0, 100),
                    Inset: false
                },
            },
        },
        Container{
            Position: PositionType.Absolute,
            Left: 0,
            Right: 0,
            Bottom: 0,
            Height: Length.Percent(34),
            BackgroundGradient: LinearGradient(90.0, Color.Rgb(116, 86, 62), Color.Rgb(73, 54, 43)),
            BorderTopWidth: 2,
            BorderColor: Color.Rgba(35, 25, 20, 120),
        },
        Container{
            Position: PositionType.Absolute,
            Left: Length.Percent(5),
            Right: Length.Percent(5),
            Bottom: Length.Percent(4),
            Height: Length.Percent(27),
            BackgroundGradient: LinearGradient(90.0, Color.Rgb(77, 55, 43), Color.Rgb(42, 31, 27)),
            BorderWidth: 2,
            BorderColor: Color.Rgba(31, 22, 19, 180),
            BoxShadows: []BoxShadow{
                BoxShadow{
                    OffsetX: 0.0,
                    OffsetY: 7.0,
                    Blur: 12.0,
                    Spread: -3.0,
                    Color: Color.Rgba(0, 0, 0, 130),
                    Inset: true
                },
            },
            Container{
                Position: PositionType.Absolute,
                Left: Length.Percent(44),
                Top: 9,
                Width: Length.Percent(12),
                Height: 5,
                BackgroundColor: Color.Rgba(205, 183, 151, 120),
            },
        },
    }

    private func inkSurface() Blob -> Container{
        Key: "act-surface",
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Right: 0,
        Bottom: 0,
        TransitionMs: 250.0,
        BackgroundColor: Color.Rgb(224, 217, 198),
        Container{
            Position: PositionType.Absolute,
            Left: Length.Percent(6),
            Top: Length.Percent(7),
            Width: Length.Percent(88),
            Height: Length.Percent(86),
            BackgroundColor: Color.Rgb(244, 239, 221),
            BorderWidth: 1,
            BorderColor: Color.Rgb(197, 188, 165),
            BoxShadows: []BoxShadow{
                BoxShadow{
                    OffsetX: 0.0,
                    OffsetY: 8.0,
                    Blur: 18.0,
                    Spread: -4.0,
                    Color: Color.Rgba(38, 31, 24, 80),
                    Inset: false
                },
            },
            Container{
                Position: PositionType.Absolute,
                Left: Length.Percent(7),
                Top: 0,
                Bottom: 0,
                Width: 1,
                BackgroundColor: Color.Rgba(190, 75, 67, 100),
            },
            Container{
                Position: PositionType.Absolute,
                Left: 0,
                Right: 0,
                Top: Length.Percent(62),
                Height: 1,
                BackgroundColor: Color.Rgba(90, 126, 156, 80),
            },
        },
    }

    private func cipherHistory() Blob {
        let rows = List[Blob]()
        let scaled = cipherProgress.Value * float64(cipherTexts.Count - 1)
        let current = Math.Min(int32(Math.Floor(scaled)), cipherTexts.Count - 1)
        let first = Math.Max(0, current - 4)
        var index = first
        while index < current {
            let distance = current - index
            rows.Add(
                Text{
                    Key: "cipher-history-" + index.ToString(),
                    Content: cipherTexts[index],
                    FontSize: if Compact {
                        13
                    } else {
                        16
                    },
                    FontWeight: 600,
                    LetterSpacing: 2,
                    Color: Color.Rgba(111, 218, 166, uint8(35 + (5 - distance) * 18)),
                }
            )
            index = index + 1
        }
        return Container{
            Position: PositionType.Absolute,
            Left: Length.Percent(8),
            Right: Length.Percent(8),
            Bottom: Length.Percent(9),
            Height: 122,
            FlexDirection: FlexDirection.Column,
            Gap: 6,
            Children: rows,
        }
    }

    private func cipherSurface() Blob -> Container{
        Key: "act-surface",
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Right: 0,
        Bottom: 0,
        TransitionMs: 250.0,
        BackgroundColor: Color.Rgb(9, 18, 18),
        BorderWidth: 1,
        BorderColor: Color.Rgb(39, 73, 64),
        Container{
            Position: PositionType.Absolute,
            Left: Length.Percent(7),
            Right: Length.Percent(7),
            Top: Length.Percent(21),
            Height: 1,
            BackgroundColor: Color.Rgba(105, 219, 165, 55),
        },
        Container{
            Position: PositionType.Absolute,
            Left: Length.Percent(7),
            Right: Length.Percent(7),
            Top: Length.Percent(57),
            Height: 1,
            BackgroundColor: Color.Rgba(105, 219, 165, 35),
        },
        cipherHistory(),
    }

    private func stageSurface() Blob {
        if activeAct == 0 {
            return fridgeSurface()
        }
        if activeAct == 1 {
            return inkSurface()
        }
        return cipherSurface()
    }

    private func actButton(label string, act int32) Blob -> Button{
        Padding: 10,
        BackgroundColor: if activeAct == act {
            GalleryTheme.Ink
        } else {
            GalleryTheme.SurfaceRaised
        },
        BorderWidth: 1,
        BorderColor: if activeAct == act {
            GalleryTheme.Ink
        } else {
            GalleryTheme.Border
        },
        BorderRadius: 8,
        TransitionMs: 100.0,
        Hover: Style{
            BackgroundColor: if activeAct == act {
                GalleryTheme.Ink
            } else {
                GalleryTheme.Border
            }
        },
        Focus: Style{OutlineWidth: 1, OutlineColor: GalleryTheme.BorderStrong},
        Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: label,},
        OnClick: () -> switchAct(act),
        Text{
            Content: label,
            FontSize: 13,
            FontWeight: 700,
            Color: if activeAct == act {
                GalleryTheme.Background
            } else {
                GalleryTheme.Ink
            },
        },
    }

    private func controls() Blob {
        let children = List[Blob]()
        children.Add(actButton("Fridge", 0))
        children.Add(actButton("Ink", 1))
        children.Add(actButton("Cipher", 2))
        if activeAct == 0 {
            children.Add(GalleryTheme.GhostButton("Restore", () -> restoreMagnets()))
            children.Add(GalleryTheme.GhostButton("Drawer", () -> drawerMagnets()))
        } else if activeAct == 1 {
            children.Add(GalleryTheme.GhostButton("Replay", () -> replayInk()))
        } else {
            children.Add(GalleryTheme.GhostButton("Replay", () -> replayCipher()))
        }
        return Container{
            Width: Length.Percent(100),
            FlexDirection: FlexDirection.Row,
            FlexWrap: FlexWrap.Wrap,
            Gap: 8,
            Children: children,
        }
    }

    private func stage() Blob {
        let children = List[Blob]()
        children.Add(stageSurface())
        var index int32 = 0
        while index < letters.Count {
            children.Add(letterBlob(letters[index]))
            index = index + 1
        }
        return Container{
            Handle: stageHandle,
            Width: Length.Percent(100),
            FlexGrow: 1.0,
            FlexShrink: 1.0,
            MinWidth: 0,
            MinHeight: 0,
            Position: PositionType.Relative,
            BackgroundColor: GalleryTheme.SurfaceRaised,
            BorderWidth: 1,
            BorderColor: GalleryTheme.BorderStrong,
            Children: children,
        }
    }

    private func content() Blob -> Container{
        Width: Length.Percent(100),
        FlexGrow: 1.0,
        FlexShrink: 1.0,
        MinWidth: 0,
        MinHeight: 0,
        FlexDirection: FlexDirection.Column,
        Gap: 10,
        controls(),
        stage(),
    }

    override func Build() Blob {
        syncFridgeMotion()
        return GallerySpecimen(
            "One State, Many Surfaces",
            "Drag the magnets, replay the ink, or watch the same retained phrase solve itself.",
            content()
        )
    }
}
