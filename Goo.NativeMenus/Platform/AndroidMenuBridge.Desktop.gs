package Goo

import System.Threading.Tasks

internal sealed class AndroidMenuBridge {
    shared {
        internal func Show(owner Window, point Point, snapshot NativeMenuSnapshot) Task[NativeMenuResult]
            -> Task.FromResult(NativeMenuResult(NativeMenuStatus.Unsupported))
    }
}
