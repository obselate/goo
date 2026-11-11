## Fixed

- Images drawn below their source size use mipmaps to reduce aliasing. Premultiplied sampling prevents dark transparent edges. Goo uses mipmaps only when GPU memory permits.
