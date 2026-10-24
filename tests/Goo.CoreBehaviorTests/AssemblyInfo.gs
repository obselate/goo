import Goo
import System.Runtime.CompilerServices
import Xunit

@assembly: CollectionBehavior(DisableTestParallelization = true)

internal shared class TestApplication {
    @ModuleInitializer
    internal func Configure() {
        Window.ConfigureApplication("Goo Tests", "0.1.0", "io.github.obselate.goo.tests")
    }
}
