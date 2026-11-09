## Fixed

- Images drawn smaller than their source no longer alias, and transparent image edges no longer darken. Goo now keeps image texels premultiplied, builds a full mip chain for each uploaded image and samples it with trilinear filtering. A mip chain uses about one third more GPU memory. Goo adds it only when it fits the GPU heap budget. Otherwise the image keeps only its full-size level. When a full-size level does not fit, Goo copies drawn images with mip chains to new full-size-only images on the GPU, so the GPU budget holds as many images as without mip chains.
