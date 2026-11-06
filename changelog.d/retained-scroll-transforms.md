## Changed

- Scroll content moves in whole physical pixels without relayout or recompilation for offset-only updates.
- Retained scene ranges preserve nested clips, text, effects and interaction placement while dirty content is compiled separately.
- Reuse effect-closed damage bounds during scene classification.
