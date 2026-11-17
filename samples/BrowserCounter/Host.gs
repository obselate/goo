package GooStarter

import Goo
import Goo.Wasm
import System
import System.IO
import System.Reflection
import System.Runtime.CompilerServices

internal shared class BrowserHost {
    @ModuleInitializer
    internal func Initialize() {
        try {
            using let stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Goo.Counter.Font.ttf")
                ?? throw InvalidOperationException("Missing counter font")
            using let bytes = MemoryStream()
            stream.CopyTo(bytes)
            FontSource("sans-serif", 400, false, bytes.ToArray()).Register()
            if OperatingSystem.IsBrowser() { BrowserWindowHost.Configure() }
        } catch (error Exception) {
            Console.Error.WriteLine(error.ToString())
            rethrow
        }
    }
}
