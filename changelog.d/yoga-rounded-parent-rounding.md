## Changed

- Layout rounds each box to the device grid relative to its parent's rounded position instead of the unrounded absolute position chain. Children of a box that sits on a half device pixel can move by one device pixel; text in popups, custom layouts and the main tree now lands on the same device rows when their boxes do. Integer scales change only where layout positions are fractional.
