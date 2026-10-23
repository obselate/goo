# Shared gestures

```gsharp
import Goo
import Goo.Gestures

let navigation = TransformGesture(UpdateViewport)
let surface = Container{Gestures: []GestureRecognizer{navigation}}
```

- Keep recognizer instances stable across rebuilds. Core owns arbitration and cancellation.
- Use `TransformGesture` for combined pan, pinch and rotation.
- `PanGesture`, `LongPressGesture` and `DoubleTapGesture` provide separate interactions.
- SDL trackpad pinch reports scale only. Its rotation status is Unsupported.

See the [input guide](https://github.com/obselate/goo/blob/main/docs/api/input.md#use-shared-recognizers) for lifecycle and platform limits.
