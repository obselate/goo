import Goo
import System
import System.IO
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

    @Fact
    func SingleInstanceScopeSeparatesAddressesAndPreservesTheDefault() {
        Assert.Throws[ArgumentException](() -> Application.AcquireSingleInstance([]string{}, instanceScope: ""))
        if !OperatingSystem.IsLinux() { return }
        let previous = Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR")
        let runtime = Directory.CreateTempSubdirectory()
        try {
            Environment.SetEnvironmentVariable("XDG_RUNTIME_DIR", runtime.FullName)
            let identity = "org.goo.scope-test"
            let unscoped = InstanceScope.Create(identity)
            let path = Path.Combine(runtime.FullName, "goo", "515DD88983FDDB72BE47A728D6723F2F")
            Assert.Equal(path + ".lock", unscoped.LeasePath)
            Assert.Equal(path + ".pipe", unscoped.PipeName)
            let first = InstanceScope.Create(identity, "first")
            let second = InstanceScope.Create(identity, "second")
            Assert.NotEqual(unscoped.LeasePath, first.LeasePath)
            Assert.NotEqual(unscoped.PipeName, first.PipeName)
            Assert.NotEqual(first.LeasePath, second.LeasePath)
            Assert.NotEqual(first.PipeName, second.PipeName)
        } finally {
            Environment.SetEnvironmentVariable("XDG_RUNTIME_DIR", previous)
            runtime.Delete(true)
        }
    }
}
