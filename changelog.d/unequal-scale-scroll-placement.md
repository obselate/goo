## Fixed

- Apply vertical scroll placement with the framebuffer's vertical scale, including text placement.
- Use placed offscreen layer origins and scales for nested clip masks.
- Test placed layer bounds during partial redraw so late image content is not omitted.
- Report the clamped logical scroll state through element handles and metric subscriptions.
