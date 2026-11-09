## Fixed

- Images drawn smaller than their source no longer alias. Goo now builds a full mip chain for each uploaded image and samples it with trilinear filtering. Each image uses about one third more GPU memory, and the image cache budget counts it.
