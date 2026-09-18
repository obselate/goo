package Goo

internal partial class TextShaping {
  shared {
    internal func PrimaryFaceCacheCountForTests() int32 {
      lock (PrimaryFacesLock) { return PrimaryFaces.Count }
    }

    internal func PrimaryFaceCacheByteBudgetForTests() int64 -> PrimaryFaceCacheByteBudget

    internal func PrimaryFaceCacheBytesForTests() int64 {
      lock (PrimaryFacesLock) { return primaryFaceCacheBytes }
    }
  }
}
