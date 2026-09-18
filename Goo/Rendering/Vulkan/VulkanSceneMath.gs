package Goo

import System

internal func nextVulkanSceneVersion(value uint64) uint64 -> if value == uint64.MaxValue { 1uL } else { value + 1uL }

internal func finiteVulkanSceneValue(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

internal func unionVulkanSceneBounds(left ConservativeBounds, right ConservativeBounds) ConservativeBounds {
  let x = left.X < right.X ? left.X : right.X
  let y = left.Y < right.Y ? left.Y : right.Y
  let rightEdge = left.Right > right.Right ? left.Right : right.Right
  let bottomEdge = left.Bottom > right.Bottom ? left.Bottom : right.Bottom
  return ConservativeBounds{
    X: x,
    Y: y,
    Width: rightEdge - x,
    Height: bottomEdge - y,
  }
}
