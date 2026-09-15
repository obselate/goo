package GooGallery

import Goo
import System
import System.Collections.Generic

class GallerySurfaceLetter {
    internal let Id int32
    internal let SourceIndex int32
    internal let Character char
    internal var Magnet Point
    internal var MagnetRotation float64
    internal var RestoreFrom Point
    internal var RestoreRotation float64
    internal var DrawerTarget Point
    internal var DrawerRotation float64
    internal var DrawerRank int32
    internal var TransitionFrom Point
    internal var TransitionRotation float64
    internal var TransitionScale float64

    internal init(id int32, sourceIndex int32, character char, magnet Point, rotation float64) {
        Id = id
        SourceIndex = sourceIndex
        Character = character
        Magnet = magnet
        MagnetRotation = rotation
        RestoreFrom = magnet
        RestoreRotation = rotation
        DrawerTarget = magnet
        DrawerRotation = rotation
        DrawerRank = id
        TransitionFrom = magnet
        TransitionRotation = rotation
        TransitionScale = 1.0
    }
}

class GalleryCipherStep {
    internal let BeforeSlots[]int32
    internal let AfterSlots[]int32
    internal let MovingId int32
    internal let FromSlot int32
    internal let ToSlot int32

    internal init(beforeSlots[]int32, afterSlots[]int32, movingId int32, fromSlot int32, toSlot int32) {
        BeforeSlots = beforeSlots
        AfterSlots = afterSlots
        MovingId = movingId
        FromSlot = fromSlot
        ToSlot = toSlot
    }
}

class GalleryHandGlyph {
    internal let RevealBias float64
    internal let PenPoints[]Point

    internal init(length float64, penPoints[]Point) {
        RevealBias = Math.Clamp(length / 180.0, 0.72, 1.18)
        PenPoints = penPoints
    }

    internal func Reveal(progress float64) float64 ->
    Math.Pow(Math.Clamp(progress, 0.0, 1.0), RevealBias)

    internal func Pen(progress float64) Point {
        if PenPoints.Length == 0 {
            return Point{X: 50.0, Y: 50.0}
        }
        if PenPoints.Length == 1 {
            return PenPoints[0]
        }
        let scaled = Math.Clamp(progress, 0.0, 1.0) * float64(PenPoints.Length - 1)
        let index = int32(Math.Floor(scaled))
        if index >= PenPoints.Length - 1 {
            return PenPoints[PenPoints.Length - 1]
        }
        let local = scaled - float64(index)
        let from = PenPoints[index]
        let to = PenPoints[index + 1]
        return Point{X: from.X + (to.X - from.X) * local, Y: from.Y + (to.Y - from.Y) * local,}
    }
}

class GalleryHandAlphabet {
    private let glyphs Dictionary[char, GalleryHandGlyph]

    internal init() {
        glyphs = Dictionary[char, GalleryHandGlyph]()
        glyphs.Add('S', buildUpperS())
        glyphs.Add('t', buildT())
        glyphs.Add('a', buildA())
        glyphs.Add('e', buildE())
        glyphs.Add('c', buildC())
        glyphs.Add('r', buildR())
        glyphs.Add('o', buildO())
        glyphs.Add('s', buildS())
        glyphs.Add('u', buildU())
        glyphs.Add('f', buildF())
    }

    internal func Glyph(value char) GalleryHandGlyph -> glyphs[value]

    private func buildUpperS() GalleryHandGlyph -> GalleryHandGlyph(
        220.0,
        []Point{
            Point{X: 82.0, Y: 18.0},
            Point{X: 52.0, Y: 7.0},
            Point{X: 20.0, Y: 30.0},
            Point{X: 48.0, Y: 49.0},
            Point{X: 77.0, Y: 68.0},
            Point{X: 55.0, Y: 93.0},
            Point{X: 16.0, Y: 81.0},
        }
    )

    private func buildT() GalleryHandGlyph -> GalleryHandGlyph(
        160.0,
        []Point{
            Point{X: 56.0, Y: 10.0},
            Point{X: 54.0, Y: 45.0},
            Point{X: 53.0, Y: 78.0},
            Point{X: 73.0, Y: 82.0},
            Point{X: 27.0, Y: 37.0},
            Point{X: 78.0, Y: 37.0},
        }
    )

    private func buildA() GalleryHandGlyph -> GalleryHandGlyph(
        190.0,
        []Point{
            Point{X: 77.0, Y: 76.0},
            Point{X: 71.0, Y: 42.0},
            Point{X: 50.0, Y: 36.0},
            Point{X: 22.0, Y: 65.0},
            Point{X: 47.0, Y: 84.0},
            Point{X: 76.0, Y: 58.0},
            Point{X: 76.0, Y: 88.0},
        }
    )

    private func buildE() GalleryHandGlyph -> GalleryHandGlyph(
        180.0,
        []Point{
            Point{X: 23.0, Y: 61.0},
            Point{X: 42.0, Y: 35.0},
            Point{X: 78.0, Y: 55.0},
            Point{X: 23.0, Y: 64.0},
            Point{X: 48.0, Y: 91.0},
            Point{X: 80.0, Y: 76.0},
        }
    )

    private func buildC() GalleryHandGlyph -> GalleryHandGlyph(
        140.0,
        []Point{
            Point{X: 79.0, Y: 45.0},
            Point{X: 52.0, Y: 31.0},
            Point{X: 22.0, Y: 62.0},
            Point{X: 48.0, Y: 93.0},
            Point{X: 81.0, Y: 76.0},
        }
    )

    private func buildR() GalleryHandGlyph -> GalleryHandGlyph(
        120.0,
        []Point{
            Point{X: 28.0, Y: 88.0},
            Point{X: 29.0, Y: 38.0},
            Point{X: 29.0, Y: 51.0},
            Point{X: 52.0, Y: 34.0},
            Point{X: 77.0, Y: 44.0},
        }
    )

    private func buildO() GalleryHandGlyph -> GalleryHandGlyph(
        170.0,
        []Point{
            Point{X: 74.0, Y: 48.0},
            Point{X: 50.0, Y: 30.0},
            Point{X: 22.0, Y: 61.0},
            Point{X: 52.0, Y: 94.0},
            Point{X: 75.0, Y: 77.0},
            Point{X: 74.0, Y: 48.0},
        }
    )

    private func buildS() GalleryHandGlyph -> GalleryHandGlyph(
        160.0,
        []Point{
            Point{X: 75.0, Y: 43.0},
            Point{X: 48.0, Y: 32.0},
            Point{X: 26.0, Y: 52.0},
            Point{X: 53.0, Y: 66.0},
            Point{X: 73.0, Y: 77.0},
            Point{X: 48.0, Y: 94.0},
            Point{X: 22.0, Y: 84.0},
        }
    )

    private func buildU() GalleryHandGlyph -> GalleryHandGlyph(
        170.0,
        []Point{
            Point{X: 25.0, Y: 39.0},
            Point{X: 25.0, Y: 70.0},
            Point{X: 46.0, Y: 91.0},
            Point{X: 75.0, Y: 70.0},
            Point{X: 76.0, Y: 39.0},
            Point{X: 76.0, Y: 88.0},
        }
    )

    private func buildF() GalleryHandGlyph -> GalleryHandGlyph(
        150.0,
        []Point{
            Point{X: 65.0, Y: 13.0},
            Point{X: 38.0, Y: 18.0},
            Point{X: 36.0, Y: 88.0},
            Point{X: 18.0, Y: 39.0},
            Point{X: 76.0, Y: 39.0},
        }
    )
}
