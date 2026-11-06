package Goo

import Facebook.Yoga
import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal partial class VulkanSceneCompiler {
  shared {
    internal func RetireNode(node Node) {
      let cached = node.VulkanOwner
      let token = node.VulkanOwnerToken as WeakReference[VulkanSceneCompiler]
      node.VulkanOwner = nil
      node.VulkanOwnerToken = nil
      if let owner = cached {
        if token != nil && token.TryGetTarget(out var compiler) { compiler.ForgetOwner(owner) }
        else { owner.ClearCachedState() }
      }
      if let metadata = node.PortalState, let previous = metadata.VulkanOwners {
        metadata.VulkanOwners = nil
        for entry in previous {
          if !Object.ReferenceEquals(entry.Value, cached) { entry.Key.ForgetOwner(entry.Value) }
        }
      }
    }
  }

  private func Owner(node Node) VulkanSceneOwnerId {
    if let cached = node.VulkanOwner {
      if cached.Generation != node.MountGeneration {
        RetireNode(node)
      } else if Object.ReferenceEquals(node.VulkanOwnerToken, ownerToken) {
        return cached
      }
    }
    if let previous = node.VulkanOwnerToken as WeakReference[VulkanSceneCompiler],
      let previousOwner = node.VulkanOwner && previous.TryGetTarget(out var previousCompiler) {
      let metadata = node.EnsurePortalState()
      let owners = metadata.VulkanOwners ?? ConditionalWeakTable[VulkanSceneCompiler, VulkanSceneOwnerId]()
      metadata.VulkanOwners = owners
      owners.AddOrUpdate(previousCompiler, previousOwner)
    }
    if let previous = node.PortalState?.VulkanOwners && previous.TryGetValue(this, out var existing) {
      if existing.Generation == node.MountGeneration {
        InvalidateRange(existing)
        node.VulkanOwnerToken = ownerToken
        node.VulkanOwner = existing
        return existing
      }
      previous.Remove(this)
      ForgetOwner(existing)
    }
    if nextOwnerId >= BackdropBlurMaskBit {
      throw OverflowException("Vulkan scene owner id overflow")
    }
    let value = VulkanSceneOwnerId(nextOwnerId, node.MountGeneration)
    node.VulkanOwnerToken = ownerToken
    node.VulkanOwner = value
    nextOwnerId = nextOwnerId + 1uL
    return value
  }

  private func OwnerId(node Node) uint64 -> Owner(node).Value


  private func ForgetOwner(owner VulkanSceneOwnerId) {
    owner.ClearCachedState()
    ForgetRange(owner)
    roundedOverflowPaths.Remove(owner)
    backdropBlurPaths.Remove(owner)
    textScene?.ForgetOwner(owner)
  }

  private func MarkUnsupportedNode(node Node) {
    switch node.Kind {
      case NodeKind.Text {
        if textScene == nil {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Text,
            VulkanSceneUnsupportedField.None,
            VulkanSceneUnsupportedPrimitive.Text)
          unsupportedNodeCount = unsupportedNodeCount + 1
        }
      }
      case NodeKind.Image {
        let source = node.ImageSource
        if source != nil && imageScene == nil {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Image,
            VulkanSceneUnsupportedField.None,
            VulkanSceneUnsupportedPrimitive.Image)
          unsupportedNodeCount = unsupportedNodeCount + 1
        }
      }
      case NodeKind.Shape {
        if node.ShapePath.CommandCount != 0 && pathScene == nil {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Shape,
            VulkanSceneUnsupportedField.None,
            VulkanSceneUnsupportedPrimitive.Shape)
          unsupportedNodeCount = unsupportedNodeCount + 1
        }
      }
      case NodeKind.Entry {
        if !TextEntrySupported(node) {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Entry,
            VulkanSceneUnsupportedField.None,
            VulkanSceneUnsupportedPrimitive.TextEntry)
          unsupportedNodeCount = unsupportedNodeCount + 1
        }
      }
      case NodeKind.Editor {
        if let _ = node.EditorState {
          if !TextEditorSupported(node) {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Editor,
              VulkanSceneUnsupportedField.None,
              VulkanSceneUnsupportedPrimitive.TextEditor)
            unsupportedNodeCount = unsupportedNodeCount + 1
          }
        }
      }
      case _ { }
    }
  }

  private func MarkUnsupported(kind VulkanSceneUnsupportedKind) {
    unsupportedMask = unsupportedMask | uint32(kind)
    unsupportedPrimitiveCount = unsupportedPrimitiveCount + 1
  }

  private func MarkUnsupported(node Node, kind VulkanSceneUnsupportedKind,
    field VulkanSceneUnsupportedField, primitive VulkanSceneUnsupportedPrimitive) {
      MarkUnsupported(kind)
      RecordUnsupportedDetail(node, field, primitive)
    }

  private func RecordUnsupportedDetail(node Node, field VulkanSceneUnsupportedField,
    primitive VulkanSceneUnsupportedPrimitive) {
      if unsupportedDetailCount >= unsupportedDetails.Length {
        unsupportedDetailDropped = unsupportedDetailDropped + 1
        return
      }
      unsupportedDetails[unsupportedDetailCount] = VulkanSceneUnsupportedDetail{
        OwnerId: OwnerId(node),
        NodeKind: node.Kind,
        Blob: BlobKind(node),
        Field: field,
        Primitive: primitive,
      }
      unsupportedDetailCount = unsupportedDetailCount + 1
    }

  private func BlobKind(node Node) VulkanSceneUnsupportedBlobKind {
    switch node.Kind {
      case NodeKind.Container { return VulkanSceneUnsupportedBlobKind.Container }
      case NodeKind.Button { return VulkanSceneUnsupportedBlobKind.Button }
      case NodeKind.Text { return VulkanSceneUnsupportedBlobKind.Text }
      case NodeKind.Entry { return VulkanSceneUnsupportedBlobKind.TextEntry }
      case NodeKind.Editor { return VulkanSceneUnsupportedBlobKind.TextEditor }
      case NodeKind.Shape { return VulkanSceneUnsupportedBlobKind.Shape }
      case NodeKind.Image { return VulkanSceneUnsupportedBlobKind.Image }
      case _ { return VulkanSceneUnsupportedBlobKind.None }
    }
  }
}
