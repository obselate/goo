package Goo

import System.Collections.Generic

internal class DragTargetRouting {
  shared {
    internal func AllowsPath(path List[Node]) bool -> path.Count > 0
      && canReceiveInput(path[path.Count - 1])

    internal func Available(root Node, target Node) bool -> !target.Retired
      && containsPath(root, target) && canReceiveInput(target)
      && DragDropMetadata.Target(target) != nil

    internal func CreateEvent(data DragData, target Node, kind DragEventKind,
      x float32, y float32, modifiers KeyModifiers, allowedEffects DragEffect,
      effect DragEffect, pointerId int64, device PointerDevice, isPointer bool = true) DragEvent? {
      let mapped = TransformGeometry.WindowToNode(target, x, y)
      if !mapped.Valid { return nil }
      return DragEvent{
        Kind: kind, Data: data, PointerId: pointerId, Device: device, IsPointer: isPointer,
        Position: Point{X: float64(mapped.X - target.Rect.X), Y: float64(mapped.Y - target.Rect.Y)},
        WindowPosition: Point{X: float64(x), Y: float64(y)}, Modifiers: modifiers,
        AllowedEffects: allowedEffects, Effect: effect,
      }
    }
  }
}
