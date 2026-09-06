package Goo

import System
import System.Reflection
import System.Reflection.Metadata

@assembly: MetadataUpdateHandler(typeof(GooMetadataUpdateHandler))
internal class GooMetadataUpdateHandler {
  shared {
    public func ClearCache(updatedTypes([]Type)?) {
      DevTools.MetadataUpdated()
    }

    public func UpdateApplication(updatedTypes([]Type)?) {
      Window.RequestHotReload()
    }
  }
}
