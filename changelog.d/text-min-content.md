## Fixed

- Wrapping `Text` shrinks to its widest unbreakable segment. Set `MinWidth: 0` to let it shrink further and break inside words.
- Flex items share space correctly when siblings reach their minimum or maximum size. Overflowing rows no longer grow flex items.
