## Fixed

- Images drawn smaller than their source no longer alias, and transparent image edges no longer darken. Goo now keeps image texels premultiplied, builds a full mip chain for each uploaded image and samples it with trilinear filtering. A mip chain uses about one third more GPU memory. Goo adds it only when it fits the GPU heap budget. Otherwise the image keeps only its full-size level.
