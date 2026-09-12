package Goo

import System
import System.Runtime.CompilerServices

internal class BackgroundImageLayouts {
  shared {
    private var values ConditionalWeakTable[Node, BackgroundImageValue]?

    internal func Path(n Node) string -> if let value = state(n) { value.Path } else { "" }

    internal func Source(n Node) ImageSourceProvider ? -> if let value = state(n) { value.Source } else { nil }

    internal func CurrentToken(n Node) ImageSourceBindingToken ? -> state(n)?.CurrentToken()

    internal func Image(n Node) DecodedImage? {
      guard let value = state(n) else { return nil }
      if !value.Settled { Refresh(n) }
      return value.Image
    }

    internal func SetPath(n Node, path string, invalidated Action?) bool {
      var value = state(n)
      if value == nil {
        if path == "" { return false }
        value = create(n)
      }
      let current = value
      let changed = current.Path != path
      current.Path = path
      current.Invalidated = invalidated
      if current.Source != nil {
        return Refresh(n)
      }
      if !changed { return Refresh(n) }
      releasePath(current)
      current.Image = nil
      current.Settled = false
      if path == "" {
        remove(n, current)
        return false
      }
      startPath(n, current, path)
      return Refresh(n)
    }

    internal func SetSource(n Node, source ImageSourceProvider?, invalidated Action?) bool {
      if source == nil {
        guard let current = state(n) else { return false }
        current.Invalidated = invalidated
        if current.Source == nil { return Refresh(n) }
        current.ReleaseSource()
        current.Image = nil
        current.Settled = false
        if current.Path == "" {
          remove(n, current)
          return false
        }
        startPath(n, current, current.Path)
        return Refresh(n)
      }
      var value = state(n)
      if value == nil { value = create(n) }
      let current = value
      current.Invalidated = invalidated
      if current.Source == source { return Refresh(n) }
      releasePath(current)
      current.Image = nil
      current.Settled = false
      current.SetSourceChanged(() -> {
        BackgroundImageLayouts.refreshSource(n, current)
      })
      current.RebindSource(source)
      if Refresh(n) { return true }
      current.WatchSource((token ImageSourceBindingToken) -> {
        BackgroundImageLayouts.invalidateSource(n, current, token)
      })
      return false
    }

    internal func Refresh(n Node) bool {
      guard let value = state(n) else { return false }
      if value.Settled { return false }
      var image DecodedImage?
      if let lease = value.Lease {
        if !lease.IsComplete { return false }
        image = value.CompletedResult()
      } else if let request = value.Request {
        image = request.Result
      } else {
        return false
      }
      if value.Image == image {
        value.Settled = true
        return false
      }
      value.Image = image
      value.Settled = true
      return true
    }

    internal func Dispose(n Node) {
      guard let value = state(n) else {
        return
      }
      remove(n, value)
    }

    private func create(n Node) BackgroundImageValue {
      let value = BackgroundImageValue()
      if values == nil { values = ConditionalWeakTable[Node, BackgroundImageValue]() }
      values?.Add(n, value)
      n.HasBackgroundImageState = true
      return value
    }

    private func remove(n Node, value BackgroundImageValue) {
      values?.Remove(n)
      n.HasBackgroundImageState = false
      releasePath(value)
      value.ReleaseSource()
      value.Path = ""
      value.Image = nil
      value.Settled = false
      value.Invalidated = nil
    }

    private func startPath(n Node, value BackgroundImageValue, path string) {
      let request = ImageDecoding.Request(path)
      value.Request = request
      Refresh(n)
    }

    private func releasePath(value BackgroundImageValue) {
      value.Request = nil
    }

    private func state(n Node) BackgroundImageValue? {
      if !n.HasBackgroundImageState { return nil }
      if let table = values {
        if table.TryGetValue(n, out var value) { return value }
      }
      n.HasBackgroundImageState = false
      return nil
    }

    private func invalidateSource(n Node, value BackgroundImageValue,
      token ImageSourceBindingToken) {
        if n.Retired {
          return
        }
        guard let current = state(n) else {
          return
        }
        if current != value || !value.IsCurrentToken(token) {
          return
        }
        current.Invalidated?.Invoke()
      }

    private func refreshSource(n Node, value BackgroundImageValue) {
      if n.Retired {
        return
      }
      guard let current = state(n) else {
        return
      }
      if current != value {
        return
      }
      value.Settled = false
      if Refresh(n) {
        value.Invalidated?.Invoke()
        return
      }
      guard let lease = value.Lease else {
        return
      }
      if lease.IsComplete {
        return
      }
      value.WatchSource((token ImageSourceBindingToken) -> {
        BackgroundImageLayouts.invalidateSource(n, value, token)
      })
    }
  }
}

internal class BackgroundImageValue : ImageSourceBinding {
  internal var Path string
  internal var Request ImageRequest?
  internal var Image DecodedImage?
  internal var Settled bool
  internal var Invalidated Action?

  internal init() {
    Path = ""
  }
}
