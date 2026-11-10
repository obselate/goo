## Fixed

- Scrolled to the end, a scroll container or `TextEditor` now shows all of its content. The maximum scroll offset rounds up to the device pixel grid, so content that ends between device pixels is not cut by up to half a device pixel. The extra space at the end is less than one device pixel.
