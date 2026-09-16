package Goo

import System

internal class VulkanSceneDamageJournal {
  private let entries []VulkanSceneDamageEntry
  private let physicalScaleXBits []int32
  private let physicalScaleYBits []int32
  private let physicalExtentWidths []uint32
  private let physicalExtentHeights []uint32
  private let physicalKeyValid []bool
  private var entryCount int32
  private var activeIndex int32 = -1

  internal init(capacity int32) {
    if capacity <= 0 {
      throw ArgumentOutOfRangeException("capacity")
    }
    entries = [capacity]VulkanSceneDamageEntry
    physicalScaleXBits = [capacity]int32
    physicalScaleYBits = [capacity]int32
    physicalExtentWidths = [capacity]uint32
    physicalExtentHeights = [capacity]uint32
    physicalKeyValid = [capacity]bool
  }

  internal prop Count int32{ get -> entryCount }

  internal prop LatestVersion uint64{
    get {
      if entryCount == 0 {
        return 0uL
      }
      return entries[entryCount - 1].Version
    }
  }

  internal func Reset() {
    entryCount = 0
    activeIndex = -1
    var index int32 = 0
    while index < physicalKeyValid.Length {
      physicalKeyValid[index] = false
      index = index + 1
    }
  }

  internal func BeginVersion(version uint64) {
    if version == 0uL {
      throw ArgumentOutOfRangeException("version")
    }
    if activeIndex >= 0 {
      throw InvalidOperationException("Vulkan scene damage journal version is open")
    }
    if entryCount == entries.Length {
      var index int32 = 1
      while index < entryCount {
        entries[index - 1] = entries[index]
        physicalScaleXBits[index - 1] = physicalScaleXBits[index]
        physicalScaleYBits[index - 1] = physicalScaleYBits[index]
        physicalExtentWidths[index - 1] = physicalExtentWidths[index]
        physicalExtentHeights[index - 1] = physicalExtentHeights[index]
        physicalKeyValid[index - 1] = physicalKeyValid[index]
        index = index + 1
      }
      entryCount = entryCount - 1
    }
    entries[entryCount] = VulkanSceneDamageEntry{
      Version: version,
      Bounds: ConservativeBounds{},
      HasDamage: false,
      FullRedraw: false,
    }
    physicalKeyValid[entryCount] = false
    activeIndex = entryCount
    entryCount = entryCount + 1
  }

  internal func MarkFullRedraw() {
    RequireOpen()
    let entry = entries[activeIndex]
    entries[activeIndex] = VulkanSceneDamageEntry{
      Version: entry.Version,
      Bounds: entry.Bounds,
      HasDamage: entry.HasDamage,
      FullRedraw: true,
    }
  }

  internal func AddChange(oldBounds ConservativeBounds, hasOld bool,
    newBounds ConservativeBounds, hasNew bool) {
      RequireOpen()
      if !hasOld && !hasNew {
        return
      }
      let entry = entries[activeIndex]
      var bounds = entry.Bounds
      var hasDamage = entry.HasDamage
      if hasOld {
        if hasDamage {
          bounds = Union(bounds, oldBounds)
        } else {
          bounds = oldBounds
          hasDamage = true
        }
      }
      if hasNew {
        if hasDamage {
          bounds = Union(bounds, newBounds)
        } else {
          bounds = newBounds
          hasDamage = true
        }
      }
      entries[activeIndex] = VulkanSceneDamageEntry{
        Version: entry.Version,
        Bounds: bounds,
        HasDamage: hasDamage,
        FullRedraw: entry.FullRedraw,
      }
    }

  internal func EndVersion() {
    RequireOpen()
    activeIndex = -1
  }

  internal func BuildSince(appliedVersion uint64, currentVersion uint64,
    scaleX float32, scaleY float32, extentWidth uint32, extentHeight uint32,
    out region VulkanDamageRegion, out fullRedraw bool) bool{
      region = VulkanDamageRegion{}
      fullRedraw = false
      if currentVersion == 0uL || extentWidth == 0u || extentHeight == 0u {
        fullRedraw = true
        return false
      }

      let scaleXBits = BitConverter.SingleToInt32Bits(scaleX)
      let scaleYBits = BitConverter.SingleToInt32Bits(scaleY)
      let currentIndex = FindEntry(currentVersion)
      var physicalTransition = false
      if appliedVersion == currentVersion {
        physicalTransition = !PhysicalKeyMatches(currentIndex, scaleXBits, scaleYBits,
          extentWidth, extentHeight)
      } else if appliedVersion != 0uL {
        let appliedIndex = FindEntry(appliedVersion)
        physicalTransition = !PhysicalKeyMatches(appliedIndex, scaleXBits, scaleYBits,
          extentWidth, extentHeight)
      }
      if currentIndex >= 0 && physicalKeyValid[currentIndex]
        && !PhysicalKeyMatches(currentIndex, scaleXBits, scaleYBits,
          extentWidth, extentHeight) {
            physicalTransition = true
          }
      if currentIndex >= 0 {
        physicalScaleXBits[currentIndex] = scaleXBits
        physicalScaleYBits[currentIndex] = scaleYBits
        physicalExtentWidths[currentIndex] = extentWidth
        physicalExtentHeights[currentIndex] = extentHeight
        physicalKeyValid[currentIndex] = true
      }
      if physicalTransition {
        fullRedraw = true
        region = FullRegion(extentWidth, extentHeight)
        return true
      }
      if appliedVersion == currentVersion {
        return false
      }
      if appliedVersion == 0uL || currentVersion < appliedVersion
        || entryCount == 0 || activeIndex >= 0 {
          fullRedraw = true
          region = FullRegion(extentWidth, extentHeight)
          return true
        }
      let firstVersion = entries[0].Version
      if appliedVersion < firstVersion && appliedVersion != 0uL {
        fullRedraw = true
        region = FullRegion(extentWidth, extentHeight)
        return true
      }
      var expected = nextVulkanSceneVersion(appliedVersion)
      var index int32 = 0
      var hasDamage = false
      var bounds ConservativeBounds{}
      while index < entryCount {
        let entry = entries[index]
        if entry.Version < expected {
          index = index + 1
          continue
        }
        if entry.Version != expected || entry.Version > currentVersion {
          break
        }
        if entry.FullRedraw {
          fullRedraw = true
        }
        if entry.HasDamage {
          if hasDamage {
            bounds = Union(bounds, entry.Bounds)
          } else {
            bounds = entry.Bounds
            hasDamage = true
          }
        }
        if expected == uint64.MaxValue {
          fullRedraw = true
          break
        }
        expected = expected + 1uL
        index = index + 1
      }
      if expected != currentVersion + 1uL {
        fullRedraw = true
      }
      if fullRedraw {
        region = FullRegion(extentWidth, extentHeight)
        return true
      }
      if !hasDamage {
        return false
      }
      region = ToRegion(bounds, scaleX, scaleY, extentWidth, extentHeight)
      return !(region.IsEmpty)
    }

  private func FindEntry(version uint64) int32 {
    var index = entryCount - 1
    while index >= 0 {
      if entries[index].Version == version {
        return index
      }
      index = index - 1
    }
    return -1
  }

  private func PhysicalKeyMatches(index int32, scaleXBits int32, scaleYBits int32,
    extentWidth uint32, extentHeight uint32) bool{
      if index < 0 || index >= entryCount || !physicalKeyValid[index] {
        return false
      }
      return physicalScaleXBits[index] == scaleXBits
        && physicalScaleYBits[index] == scaleYBits
        && physicalExtentWidths[index] == extentWidth
        && physicalExtentHeights[index] == extentHeight
    }

  private func RequireOpen() {
    if activeIndex < 0 || activeIndex >= entryCount {
      throw InvalidOperationException("Vulkan scene damage journal has no open version")
    }
  }

  private func Union(left ConservativeBounds, right ConservativeBounds) ConservativeBounds {
    if left.IsEmpty { return right }
    if right.IsEmpty { return left }
    return unionVulkanSceneBounds(left, right)
  }

  private func ToRegion(bounds ConservativeBounds, scaleX float32, scaleY float32,
    extentWidth uint32, extentHeight uint32) VulkanDamageRegion{
      if bounds.IsEmpty || !finiteVulkanSceneValue(scaleX) || !finiteVulkanSceneValue(scaleY)
        || scaleX <= 0.0F || scaleY <= 0.0F {
          return VulkanDamageRegion{}
        }
      var left = int32(MathF.Floor(bounds.X * scaleX))
      var top = int32(MathF.Floor(bounds.Y * scaleY))
      var right = int32(MathF.Ceiling(bounds.Right * scaleX))
      var bottom = int32(MathF.Ceiling(bounds.Bottom * scaleY))
      let maxWidth = int32(extentWidth)
      let maxHeight = int32(extentHeight)
      if left < 0 { left = 0 }
      if top < 0 { top = 0 }
      if right > maxWidth { right = maxWidth }
      if bottom > maxHeight { bottom = maxHeight }
      if right <= left || bottom <= top {
        return VulkanDamageRegion{}
      }
      return VulkanDamageRegion{
        X: left,
        Y: top,
        Width: right - left,
        Height: bottom - top,
      }
    }

  private func FullRegion(extentWidth uint32, extentHeight uint32) VulkanDamageRegion -> VulkanDamageRegion {
    X: 0,
    Y: 0,
    Width: int32(extentWidth),
    Height: int32(extentHeight),
  }

}
