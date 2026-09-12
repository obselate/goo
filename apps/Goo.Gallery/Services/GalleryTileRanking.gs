package GooGallery

import Gsharp.Extensions.Go

func GalleryRankTile(index int32, value int32, generation int32, output chan [GalleryTileWorkerResult]) {
  var rank = int64(index + 1) * 104729 + int64(value + generation) * 13007
  var iteration int32 = 0
  while iteration < 4096 {
    rank = (rank * 48271 + int64(value * 97 + iteration)) % 2147483629
    iteration = iteration + 1
  }
  output <- GalleryTileWorkerResult(index: index, rank: rank)
}
