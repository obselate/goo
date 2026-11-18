package GooStarter

import Goo
import Goo.Wasm
import System
import System.Reflection
import System.Runtime.CompilerServices

internal shared class BrowserHost {
    @ModuleInitializer
    internal func Initialize() {
        using let stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Goo.Counter.Font.ttf")
            ?? throw InvalidOperationException("Missing counter font")
        let bytes = GC.AllocateUninitializedArray[uint8](Convert.ToInt32(stream.Length))
        stream.ReadExactly(bytes, 0, bytes.Length)
        FontSource("sans-serif", 400, false, bytes).Register()
        if OperatingSystem.IsBrowser() { BrowserWindowHost.Configure() }
    }
}
