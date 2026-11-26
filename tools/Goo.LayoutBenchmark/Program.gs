import Goo
import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Runtime.CompilerServices

internal enum LayoutPass {
    First;
    TextChange;
    Resize
}

internal class LayoutSubject {
    internal let Root Node
    internal let Engine Layout = Layout()

    internal init(blob Blob) {
        Root = Reconciler{Res: Resolver{}}.Mount(blob)
    }

    internal func ChangeText(content string) {
        var leaf = Root
        while leaf.Children.Count > 0 {
            leaf = leaf.Children[0]
        }
        if leaf.Kind != NodeKind.Text {
            throw InvalidOperationException("Expected a measured leaf")
        }
        leaf.Content = content
        TextLayouts.Invalidate(leaf)
    }
}

func Main(args[]string) {
    if args.Length != 0 {
        Console.WriteLine("Usage: dotnet run -c Release --project tools/Goo.LayoutBenchmark")
        Console.WriteLine(
            "On Linux, put Goo's packaged runtime libraries on LD_LIBRARY_PATH if they are not in the output directory."
        )
        return
    }
    CultureInfo.CurrentCulture = CultureInfo.InvariantCulture
    using let font = FontSource.FromPath(
        "LayoutBenchmark",
        400,
        false,
        Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf"),
        0u,
        []FontVariation{FontVariation("wght", 400.0F)}
    )
    font.Register()
    let runtime = RuntimeFeature.IsDynamicCodeSupported ? "JIT": "NativeAOT"
    Console.WriteLine("$runtime; 10 measured runs per row after one warmup run; mount, mutation and disposal excluded")
    Console.WriteLine("tree\tnodes\tpass\tpasses/run\tus/pass\tB/pass")
    for pass in[]LayoutPass{LayoutPass.First, LayoutPass.TextChange, LayoutPass.Resize} {
        Measure("matrix", 126, 32, pass, pass == LayoutPass.First ? 8: 64)
        Measure("deep", 505, 4, pass, pass == LayoutPass.First ? 16: 96)
        Measure("wide", 1025, 8, pass, pass == LayoutPass.First ? 8: 48)
    }
}

func BuildTree(shape string, variant int32) Blob {
    let specimen = Text{
        Content: "Flex layout",
        FontFamily: "LayoutBenchmark",
        FontWeight: 400,
        FontSize: 13 + variant % 4,
        TextWrap: TextWrap.NoWrap,
        MinWidth: 0
    }
    if shape == "deep" {
        var child Blob = specimen
        // Keep the spine below Goo's depth limit while exercising over 500 nodes.
        for level in 0 ... 56 {
            let parent = Container{Width: Percent(100), Height: 24, AlignItems: AlignItems.FlexStart, child}
            for sibling in 0 ... 8 {
                parent.Children.Add(Container{Width: 4 + (sibling + level + variant) % 7, Height: 2})
            }
            child = parent
        }
        return child
    }
    let root = Container{Width: Percent(100), Height: Percent(100), Gap: 2}
    if shape == "wide" {
        for row in 0 ... 512 {
            let label = row == 0 ? specimen: Text{
                Content: "Visible list slot",
                FontFamily: "LayoutBenchmark",
                FontWeight: 400,
                TextWrap: TextWrap.NoWrap
            }
            root.Children.Add(Row{Width: Percent(100), Height: 22, FlexShrink: 0, label})
        }
        return root
    }
    for row in 0 ... 5 {
        let group = Row{
            Width: Percent(100),
            FlexWrap: FlexWrap.Wrap,
            AlignItems: AlignItems.Center,
            Gap: 2 + (row + variant) % 3,
            Padding: 2
        }
        for cell in 0 ... 24 {
            let child = if cell % 6 == 0 {
                cast[Blob](
                    Text{
                        Content: specimen.Content,
                        FontFamily: "LayoutBenchmark",
                        FontWeight: 400,
                        FontSize: 13 + variant % 4,
                        TextWrap: TextWrap.NoWrap,
                        MinWidth: 0
                    }
                )
            } else {
                cast[Blob](
                    Container{Width: 18 + (cell + variant) % 17, Height: 15 + cell % 7, FlexGrow: 0.25, MaxWidth: 64}
                )
            }
            group.Children.Add(child)
        }
        root.Children.Add(group)
    }
    return root
}

func Measure(shape string, nodes int32, batchSize int32, pass LayoutPass, batches int32) {
    let blobs = [batchSize]Blob{}
    let subjects = [batchSize]LayoutSubject{}
    let micros = [10]float64{}
    let allocations = [10]float64{}
    for index in 0 ... batchSize {
        blobs[index] = BuildTree(shape, index)
    }
    for run in 0 ... 11 {
        var elapsed int64
        var allocated int64
        for batch in 0 ... batches {
            let width = pass == LayoutPass.Resize && batch % 2 == 0 ? 590.0F: 640.0F
            for index in 0 ... batchSize {
                if pass == LayoutPass.First || batch == 0 {
                    subjects[index] = LayoutSubject(blobs[index])
                    if pass != LayoutPass.First {
                        subjects[index].Engine.Calculate(subjects[index].Root, 640.0F, 480.0F)
                    }
                }
                if pass == LayoutPass.TextChange {
                    subjects[index].ChangeText(batch % 2 == 0 ? "Changed layout specimen": "Flex layout")
                }
            }
            let before = GC.GetAllocatedBytesForCurrentThread()
            let start = Stopwatch.GetTimestamp()
            for subject in subjects {
                subject.Engine.Calculate(subject.Root, width, 480.0F)
            }
            elapsed += Stopwatch.GetTimestamp() - start
            allocated += GC.GetAllocatedBytesForCurrentThread() - before
            if pass == LayoutPass.First || batch == batches - 1 {
                for subject in subjects {
                    NodeLifecycle.DisposeTree(subject.Root)
                }
            }
        }
        if run != 0 {
            let passes = batches * batchSize
            micros[run - 1] = float64(elapsed) * 1000000.0 / float64(Stopwatch.Frequency) / passes
            allocations[run - 1] = float64(allocated) / passes
        }
    }
    Array.Sort(micros)
    Array.Sort(allocations)
    Console.WriteLine(
        "$shape\t$nodes\t$pass\t${batchSize * batches}\t${(micros[4] + micros[5]) / 2.0:F3}\t${(allocations[4] + allocations[5]) / 2.0:F1}"
    )
}
