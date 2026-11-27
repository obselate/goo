package Goo

import System
import System.Threading

internal sealed class TypefaceLease : IDisposable {
  private var resource TypefaceResource?

  internal init(resource TypefaceResource) {
    this.resource = resource
  }

  internal prop Resource TypefaceResource{
    get {
      guard let value = Volatile.Read(in resource) else { throw ObjectDisposedException("TypefaceLease") }
      return value
    }
  }

  internal prop FaceId uint64{
    get {
      guard let value = Volatile.Read(in resource) else { throw ObjectDisposedException("TypefaceLease") }
      return value.Id
    }
  }

  internal prop Provider VulkanTextProvider{
    get {
      guard let value = Volatile.Read(in resource) else { throw ObjectDisposedException("TypefaceLease") }
      return value.Provider
    }
  }

  internal prop Family string{
    get {
      guard let value = Volatile.Read(in resource) else { throw ObjectDisposedException("TypefaceLease") }
      return value.Family
    }
  }

  internal prop IsRegistered bool{
    get {
      guard let value = Volatile.Read(in resource) else { throw ObjectDisposedException("TypefaceLease") }
      return value.IsRegistered
    }
  }

  internal func Duplicate() TypefaceLease {
    lock (this) {
      guard let value = resource else { throw ObjectDisposedException("TypefaceLease") }
      return value.Lease()
    }
  }

  public func Dispose() {
    var current TypefaceResource?
    lock (this) {
      current = resource
      Volatile.Write(ref resource, nil)
    }
    if let value = current { value.Release() }
  }
}
