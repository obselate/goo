import Goo
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Security.Cryptography
import System.Text.Json
import Xunit
import Xunit.Abstractions

class FlexConformanceTests(output ITestOutputHelper) {
    @Fact
    func BorderBoxesMatchChromium() {
        let clock = Stopwatch.StartNew()
        using let table = JsonDocument.Parse(
            File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Layout/flex-conformance.json"))
        )
        let fontPath = Path.Combine(AppContext.BaseDirectory, "Layout/VendSans-VariableFont_wght.ttf")
        Assert.Equal(
            table.RootElement.GetProperty("fontSha256").GetString(),
            Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(fontPath)))
        )
        using let font = FontSource.FromPath(
            "FlexConformance",
            400,
            false,
            fontPath,
            0u,
            []FontVariation{FontVariation("wght", 400.0F)}
        )
        font.Register()
        let failures = List[string]()
        let count = FlexConformanceFixtures().Run(table.RootElement, failures, line -> output.WriteLine(line))
        output.WriteLine("$count flex cases in ${clock.Elapsed.TotalMilliseconds:F1} ms")
        Assert.True(failures.Count == 0, String.Join(Environment.NewLine, failures))
    }
}
