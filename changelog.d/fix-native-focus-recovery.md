## Fixed

- Releasing native dialog ownership no longer claims focus from a native child. An unfocused release does not restore the previous Goo element.
- A pointer press recovers a focused window's input gate when no modal input or popup is active.
