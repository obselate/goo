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
    func AutomaticMinimumKeepsDefiniteCrossSize() {
        using let font = FontSource.FromPath("FlexMinimum", 400, false,
            Path.Combine(AppContext.BaseDirectory, "Layout/VendSans-VariableFont_wght.ttf"))
        font.Register()
        let rows = List[ElementHandle]()
        let groups = List[ElementHandle]()
        let grid = Container{Width: Percent(100), MinWidth: 0, Gap: 16}
        for section in 0 ... 2 {
            let groupHandle = ElementHandle()
            groups.Add(groupHandle)
            let group = Container{Key: "$section", Handle: groupHandle, MinWidth: 0, Gap: 8,
                Container{Height: 24}}
            for label in []string{"Position", "Size", "Height"} {
                let row = ElementHandle()
                rows.Add(row)
                group.Children.Add(Container{Key: label, Handle: row, Width: Percent(100), MinWidth: 0,
                    FlexDirection: FlexDirection.Row, AlignItems: AlignItems.FlexStart,
                    Container{FlexGrow: 1, FlexBasis: 0, MinWidth: 0, FlexDirection: FlexDirection.Row,
                        AlignItems: AlignItems.Center, Gap: 8,
                        Text{Content: label, Width: 160, FlexShrink: 0},
                        Container{FlexGrow: 1, MinWidth: 0, Text{Content: "878, 45"}}
                    }
                })
            }
            grid.Children.Add(group)
        }
        let window = Window{Size: LayoutSize(104, 300), Root: SizedRootFixture(() ->
            Container{Width: Percent(100), Height: Percent(100), FlexDirection: FlexDirection.Row,
                FontFamily: "FlexMinimum", FontSize: 13, LineHeight: 1.43,
                Container{Width: 100, FlexShrink: 0},
                Container{FlexGrow: 1, FlexBasis: 0, MinWidth: 0, Overflow: Overflow.Hidden,
                    Container{Width: Percent(100), Height: Percent(100),
                        Container{Height: 0, FlexGrow: 1, MinHeight: 0, OverflowY: Overflow.Scroll, grid}
                    }
                }
            })}
        try {
            window.UpdateTree()
            window.Size = LayoutSize(604, 300)
            window.UpdateTree()
            for row in rows {
                Assert.InRange(row.BorderBox.Height, 18.0, 20.0)
                Assert.Equal(504.0, row.BorderBox.Width)
            }
            for section in 0 ... 2 {
                let group = groups[section].BorderBox
                let last = rows[section * 3 + 2].BorderBox
                Assert.InRange(group.Y + group.Height - last.Y - last.Height, -1.0, 1.0)
                for index in 1 ... 3 {
                    let previous = rows[section * 3 + index - 1].BorderBox
                    let next = rows[section * 3 + index].BorderBox
                    Assert.InRange(next.Y - previous.Y - previous.Height, 7.0, 9.0)
                }
            }
        } finally { window.Close() }
    }

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
