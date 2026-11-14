import Goo
import System.Runtime.CompilerServices
import Xunit

@assembly: CollectionBehavior(DisableTestParallelization = true)

internal shared class TestApplication {
    @ModuleInitializer
    internal func Configure() {
        Application.Configure(typeof(TestApplication).Assembly)
    }
}

class ApplicationIdentityTests {
    @Fact
    func AssemblyMetadataConfiguresIdentity() {
        Assert.Throws[System.InvalidOperationException](() ->
            Application.Configure("Different product", "0.1.0", "io.github.obselate.goo.tests"))
        Assert.Throws[System.InvalidOperationException](() ->
            Application.Configure("Goo Tests", "0.1.0+application-contract", "io.github.obselate.goo.tests"))
        Assert.Throws[System.InvalidOperationException](() ->
            Application.Configure("Goo Tests", "0.1.0", "io.github.obselate.goo.other"))
        Application.Configure("Goo Tests", "0.1.0", "io.github.obselate.goo.tests")
    }
}
