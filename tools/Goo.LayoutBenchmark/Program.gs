import Goo
import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Text
import System.Runtime.CompilerServices

internal enum LayoutPass {
    First;
    MountFirst;
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
        TextLayouts.Invalidate(leaf, retainContentCache: true)
    }
}

func Main(args[]string) {
    if args.Length == 1 && args[0] == "--storage" {
        GC.KeepAlive(Node())
        let start = GC.GetAllocatedBytesForCurrentThread()
        for _ in 0 ... 16384 {
            GC.KeepAlive(Node())
        }
        let nodeBytes = (GC.GetAllocatedBytesForCurrentThread() - start) / 16384
        Console.WriteLine("Node and empty child list: $nodeBytes B")
        Console.WriteLine(
            "LayoutResult: ${Unsafe.SizeOf[LayoutResult]()} B; FlexCache: ${Unsafe.SizeOf[FlexCache]()} B; FlexItem: ${Unsafe.SizeOf[FlexItem]()} B"
        )
        return
    }
    let sample = args.Length > 0 && args[0] == "--sample"
    let chat = args.Length > 0 && args[0] == "--chat"
    if args.Length > 3 || args.Length != 0 && !sample && !chat || chat && args.Length > 2 {
        Console.WriteLine(
            "Usage: dotnet run -c Release --project tools/Goo.LayoutBenchmark -- [--storage | --chat [paragraphs] | --sample [matrix|deep|wide [First|TextChange|Resize|MountFirst]]]"
        )
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
    if chat {
        MeasureChat(args.Length == 2 ? Int32.Parse(args[1]) : 1000)
        return
    }
    let runtime = RuntimeFeature.IsDynamicCodeSupported ? "JIT" : "NativeAOT"
    let runs = sample ? 1 : 10
    Console.WriteLine("$runtime; $runs measured runs per row after one warmup; mount included only in MountFirst")
    Console.WriteLine("tree\tnodes\tpass\tpasses/run\tus/pass\tB/pass")
    for pass in[]LayoutPass{LayoutPass.First, LayoutPass.TextChange, LayoutPass.Resize, LayoutPass.MountFirst} {
        let first = pass == LayoutPass.First || pass == LayoutPass.MountFirst
        if args.Length == 3 && args[2] != pass.ToString() {
            continue
        }
        if args.Length < 2 || args[1] == "matrix" {
            Measure("matrix", 126, sample ? 4 : 32, pass, first ? 8 : (sample ? 32 : 64), runs)
        }
        if args.Length < 2 || args[1] == "deep" {
            Measure("deep", 505, 4, pass, first ? 16 : (sample ? 32 : 96), runs)
        }
        if args.Length < 2 || args[1] == "wide" {
            Measure("wide", 1025, sample ? 4 : 8, pass, first ? 8 : (sample ? 32 : 48), runs)
        }
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
            let label = row == 0 ? specimen : Text{
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

func Measure(shape string, nodes int32, batchSize int32, pass LayoutPass, batches int32, runs int32) {
    let mount = pass == LayoutPass.MountFirst
    let first = mount || pass == LayoutPass.First
    let blobs = [batchSize]Blob{}
    let subjects = [batchSize]LayoutSubject{}
    let micros = [runs]float64{}
    let allocations = [runs]float64{}
    for index in 0 ... batchSize {
        blobs[index] = BuildTree(shape, index)
    }
    for run in 0 ... runs + 1 {
        var elapsed int64
        var allocated int64
        for batch in 0 ... batches {
            let width = pass == LayoutPass.Resize && batch % 2 == 0 ? 590.0F : 640.0F
            for index in 0 ... batchSize {
                if !mount && (first || batch == 0) {
                    subjects[index] = LayoutSubject(blobs[index])
                    if !first {
                        subjects[index].Engine.Calculate(subjects[index].Root, 640.0F, 480.0F)
                    }
                }
                if pass == LayoutPass.TextChange {
                    subjects[index].ChangeText(batch % 2 == 0 ? "Changed layout specimen" : "Flex layout")
                }
            }
            let before = GC.GetAllocatedBytesForCurrentThread()
            let start = Stopwatch.GetTimestamp()
            if mount {
                for index in 0 ... batchSize {
                    let subject = LayoutSubject(blobs[index])
                    subjects[index] = subject
                    subject.Engine.Calculate(subject.Root, width, 480.0F)
                }
            } else {
                for subject in subjects {
                    subject.Engine.Calculate(subject.Root, width, 480.0F)
                }
            }
            elapsed += Stopwatch.GetTimestamp() - start
            allocated += GC.GetAllocatedBytesForCurrentThread() - before
            if first || batch == batches - 1 {
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
    let lower = (runs - 1) / 2
    let upper = runs / 2
    Console.WriteLine(
        "$shape\t$nodes\t$pass\t${batchSize * batches}\t${(micros[lower] + micros[upper]) / 2.0:F3}\t${(allocations[lower] + allocations[upper]) / 2.0:F1}"
    )
}

func MeasureChat(count int32) {
    FrameRecorder.Start(Guid.NewGuid(), 65536)
    let words = []string{"layout", "glyph", "message", "scroll", "virtual", "paragraph", "shaping", "cache", "render", "window"}
    let random = Random(7)
    let contents = [count]string{}
    let handles = [count]ElementHandle{}
    for i in 0 ... count {
        let length = 50 + random.Next(2951)
        let builder = StringBuilder("$i ")
        while builder.Length < length {
            builder.Append(words[random.Next(words.Length)]).Append(' ')
        }
        contents[i] = builder.ToString()
        handles[i] = ElementHandle()
    }
    let page int32 = 12
    let pages = (count + page - 1) / page
    Console.WriteLine("chat: $count paragraphs, 50-3000 chars, every 4th with an element handle, $page per page, width 640")
    Console.WriteLine("pass\tpages\tshape calls\tms")
    for back in []bool{false, true} {
        let shapes = FrameWorkCounters.ShapeCalls
        let start = Stopwatch.GetTimestamp()
        for step in 0 ... pages {
            let first = (back ? pages - 1 - step : step) * page
            let column = Column{Width: 640}
            for i in first ... Math.Min(first + page, count) {
                let text = Text{Content: contents[i], FontFamily: "LayoutBenchmark", FontWeight: 400}
                if i % 4 == 0 {
                    text.Handle = handles[i]
                }
                column.Children.Add(text)
            }
            let subject = LayoutSubject(column)
            subject.Engine.Calculate(subject.Root, 640.0F, 720.0F)
            NodeLifecycle.DisposeTree(subject.Root)
        }
        let elapsed = float64(Stopwatch.GetTimestamp() - start) * 1000.0 / float64(Stopwatch.Frequency)
        Console.WriteLine("${back ? "back" : "forward"}\t$pages\t${FrameWorkCounters.ShapeCalls - shapes}\t${elapsed:F1}")
    }
}
