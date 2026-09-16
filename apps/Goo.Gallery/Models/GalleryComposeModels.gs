package GooGallery

import Goo
import System.Numerics

class GallerySpecimenTile {
    internal let Index int32
    internal let Value int32

    internal init(index int32, value int32) {
        Index = index
        Value = value
    }
}

class GalleryTileWorkerResult {
    internal let Index int32
    internal let Rank int64

    internal init(index int32, rank int64) {
        Index = index
        Rank = rank
    }
}

internal data struct GalleryFibonacciPlacement(Left float64, Top float64, Size float64) { }

internal func galleryFibonacciBasePlacement(slot int32) GalleryFibonacciPlacement {
    if slot == 0 {
        return GalleryFibonacciPlacement(24.0, 5.0, 1.0)
    }
    if slot == 1 {
        return GalleryFibonacciPlacement(25.0, 5.0, 1.0)
    }
    if slot == 2 {
        return GalleryFibonacciPlacement(24.0, 6.0, 2.0)
    }
    if slot == 3 {
        return GalleryFibonacciPlacement(21.0, 5.0, 3.0)
    }
    if slot == 4 {
        return GalleryFibonacciPlacement(21.0, 0.0, 5.0)
    }
    if slot == 5 {
        return GalleryFibonacciPlacement(26.0, 0.0, 8.0)
    }
    return if slot == 6 {
        GalleryFibonacciPlacement(21.0, 8.0, 13.0)
    } else {
        GalleryFibonacciPlacement(0.0, 0.0, 21.0)
    }
}

internal func galleryFibonacciPlacement(slot int32, orientation int32) GalleryFibonacciPlacement {
    let placement = galleryFibonacciBasePlacement(slot)
    if orientation == 1 {
        return GalleryFibonacciPlacement(21.0 - placement.Top - placement.Size, placement.Left, placement.Size)
    }
    if orientation == 2 {
        return GalleryFibonacciPlacement(
            34.0 - placement.Left - placement.Size,
            21.0 - placement.Top - placement.Size,
            placement.Size
        )
    }
    if orientation == 3 {
        return GalleryFibonacciPlacement(placement.Top, 34.0 - placement.Left - placement.Size, placement.Size)
    }
    return placement
}
