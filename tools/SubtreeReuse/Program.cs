using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Globalization;
using Goo;
using Goo.Widgets.Data;

var variant = args[0];
var output = args[1];
var recorder = FrameRecorder.Start(Guid.NewGuid(), FrameRecorder.DefaultBufferBytes)!;
long sequence = 0;
#if PROTOTYPE
long priorSkipped = 0;
#endif
var results = new List<string>();
var timerSamples = new long[1000];
for (var i = 0; i < timerSamples.Length; i++)
{
    var start = Stopwatch.GetTimestamp();
    timerSamples[i] = Stopwatch.GetTimestamp() - start;
}
Array.Sort(timerSamples);
results.Add(FormattableString.Invariant($"{{\"variant\":\"{variant}\",\"mode\":\"noise-timer\",\"ms\":{timerSamples[500] * 1000.0 / Stopwatch.Frequency}}}"));
using var font = new FontSource("Vend Sans", 400, false, File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")));
font.Register();
foreach (var mode in new[] { "fresh-change", "fresh-equal", "same-reference" })
{
    var rec = new Reconciler { Res = new Resolver(), ChildScratch = new ChildDiffScratch(), Profiler = new FrameProfiler() };
    var initial = Make(20000, false);
    var node = rec.Mount(initial);
    for (var frame = 0; frame < 90; frame++)
    {
        var before = GC.GetAllocatedBytesForCurrentThread();
        var start = Stopwatch.GetTimestamp();
        var blob = mode == "same-reference" ? initial : Make(20000, mode == "fresh-change" && frame % 2 == 0);
#if PROTOTYPE
        if (SubtreeReuse.Mode >= 2) SubtreeReuse.Freeze(blob);
#endif
        var build = Elapsed(start);
        var buildBytes = GC.GetAllocatedBytesForCurrentThread() - before;
        before = GC.GetAllocatedBytesForCurrentThread();
        start = Stopwatch.GetTimestamp();
        node = rec.Diff(node, blob);
        var diff = Elapsed(start);
        var bytes = GC.GetAllocatedBytesForCurrentThread() - before;
        var trace = Drain();
        if (node.Children.Count != 20000 || node.Children[0].Key != "row-0") throw new Exception("tree identity");
        if (frame >= 30) results.Add(FormattableString.Invariant($"{{\"variant\":\"{variant}\",\"mode\":\"{mode}\",\"frame\":{frame},\"build\":{build},\"diff\":{diff},\"ms\":{build + diff},\"bytes\":{bytes},\"buildBytes\":{buildBytes},\"skipped\":{trace.skipped}}}"));
        if (frame == 0) results.Add(FormattableString.Invariant($"{{\"variant\":\"{variant}\",\"mode\":\"cold-{mode}\",\"frame\":{frame},\"build\":{build},\"diff\":{diff},\"ms\":{build + diff},\"bytes\":{bytes},\"buildBytes\":{buildBytes},\"skipped\":{trace.skipped}}}"));
    }
    NodeLifecycle.DisposeTree(node);
}
foreach (var mode in new[] { "grid-original", "grid-reuse", "grid-scroll-original", "grid-scroll-reuse" })
{
    var scene = new GridScene(mode.EndsWith("reuse"));
    var window = new Window { Width = 1200, Height = 800, Root = scene, SmoothScrolling = false };
    for (var frame = 0; frame < 4; frame++) window.UpdateTree(0);
    var grid = FindGrid(window.Tree!);
    for (var frame = 0; frame < 130; frame++)
    {
        if (mode.StartsWith("grid-scroll")) scene.Viewport.JumpTo(0, 2000 + frame * 32);
        else grid.Rebuild();
        var before = GC.GetAllocatedBytesForCurrentThread();
        var start = Stopwatch.GetTimestamp();
        window.UpdateTree(0.01);
        var ms = Elapsed(start);
        var bytes = GC.GetAllocatedBytesForCurrentThread() - before;
        var trace = Drain();
        if (frame >= 30) results.Add(FormattableString.Invariant($"{{\"variant\":\"{variant}\",\"mode\":\"{mode}\",\"frame\":{frame},\"ms\":{ms},\"bytes\":{bytes},\"skipped\":{trace.skipped},\"build\":{trace.build},\"reconcile\":{trace.reconcile},\"nodes\":{Count(window.Tree!)},\"retainedHeaders\":{scene.HeaderCount}}}"));
    }
    window.Close();
}
#if PROTOTYPE
if (SubtreeReuse.Mode == 3)
{
    var left = Make(2, false);
    var right = Make(2, true);
    SubtreeReuse.Freeze(left);
    SubtreeReuse.Freeze(right);
    right.ReuseHash = left.ReuseHash;
    right.Children[0].ReuseHash = left.Children[0].ReuseHash;
    if (SubtreeReuse.Equal(left, right)) throw new Exception("collision was accepted");
    var equal = Make(2, false);
    SubtreeReuse.Freeze(equal);
    if (!SubtreeReuse.Equal(left, equal)) throw new Exception("equal rejected");
    var owned = new OwnerScene();
    var ownerWindow = new Window { Root = owned, Width = 100, Height = 100 };
    ownerWindow.UpdateTree(0);
    if (owned.FirstBuild!.CallbackOwner != owned || owned.ConstructorBlob.CallbackOwner == owned) throw new Exception("callback ownership assumption");
    ownerWindow.Close();
}
#endif
var nodes = new Node[1000];
var allocation = GC.GetAllocatedBytesForCurrentThread();
for (var i = 0; i < nodes.Length; i++) nodes[i] = new Node();
results.Add(FormattableString.Invariant($"{{\"variant\":\"{variant}\",\"mode\":\"memory-node\",\"bytes\":{(GC.GetAllocatedBytesForCurrentThread() - allocation) / nodes.Length}}}"));
GC.KeepAlive(nodes);
var blobs = new Container[1000];
allocation = GC.GetAllocatedBytesForCurrentThread();
for (var i = 0; i < blobs.Length; i++) blobs[i] = new Container();
results.Add(FormattableString.Invariant($"{{\"variant\":\"{variant}\",\"mode\":\"memory-blob\",\"bytes\":{(GC.GetAllocatedBytesForCurrentThread() - allocation) / blobs.Length}}}"));
GC.KeepAlive(blobs);
Warm();
var heapBefore = GC.GetTotalMemory(true);
var retained = Retain();
var heap = GC.GetTotalMemory(true) - heapBefore;
results.Add(FormattableString.Invariant($"{{\"variant\":\"{variant}\",\"mode\":\"memory-tree\",\"bytes\":{heap},\"blobAlive\":{retained.Blob.IsAlive.ToString().ToLowerInvariant()}}}"));
GC.KeepAlive(retained.Node);
File.WriteAllText(output, "[" + string.Join(",", results) + "]");
Console.WriteLine($"PASS {variant} {results.Count}: identity, trace, ownership and collision contracts");

(double skipped, double build, double reconcile) Drain()
{
    var records = recorder.Read(sequence, 32768, out sequence, out var more, out _, out var dropped);
    if (more || dropped != 0) throw new Exception("trace overflow");
    double skipped = 0, build = 0, reconcile = 0;
    foreach (var record in records)
    {
        if (record.Kind == FrameTraceKind.Counter && record.Name == "reconcile.reference_skipped_nodes") skipped += record.Value0 ?? 0;
        if (record.Kind != FrameTraceKind.Duration || record.Source != "cpu.phase") continue;
        var stage = (FrameProfileStage)record.EventId;
        if (stage == FrameProfileStage.Build) build += (record.EndTicks - record.Ticks) * 1000.0 / Stopwatch.Frequency;
        if (stage == FrameProfileStage.Reconcile) reconcile += (record.EndTicks - record.Ticks) * 1000.0 / Stopwatch.Frequency;
    }
#if PROTOTYPE
    skipped = SubtreeReuse.SkippedNodes - priorSkipped;
    priorSkipped = SubtreeReuse.SkippedNodes;
#endif
    return (skipped, build, reconcile);
}
static double Elapsed(long start) => (Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency;
static Container Make(int count, bool change)
{
    var root = new Container();
    for (var i = 0; i < count; i++) root.Children.Add(new Container { Key = $"row-{i}", BackgroundColor = change && i == 0 ? Color.White : Color.Black });
    return root;
}
static int Count(Node node) => 1 + node.Children.Sum(Count);
static Cell FindGrid(Node node)
{
    for (var cell = node.Fiber; cell != null; cell = cell.directChild)
        if (cell is DataGrid) return cell;
    foreach (var child in node.Children)
    {
        try { return FindGrid(child); }
        catch (InvalidOperationException) { }
    }
    throw new InvalidOperationException("grid not found");
}
[MethodImpl(MethodImplOptions.NoInlining)]
static void Warm() { var value = Retain(); GC.KeepAlive(value.Node); }
[MethodImpl(MethodImplOptions.NoInlining)]
static (Node Node, WeakReference Blob) Retain()
{
    var blob = Make(20000, false);
    var rec = new Reconciler { Res = new Resolver() };
    return (rec.Mount(blob), new WeakReference(blob));
}
sealed class OwnerScene : Cell
{
    public readonly Blob ConstructorBlob = new Container { OnClick = () => { } };
    public Blob? FirstBuild;
    public override Blob Build() => FirstBuild ??= new Container { OnClick = () => { } };
}
sealed class GridScene(bool reuse) : Cell
{
    public readonly ElementHandle Viewport = new();
    readonly DataGridRow[] rows = Enumerable.Range(0, 10000).Select(i => new DataGridRow { Id = $"row-{i}", SourceIndex = i }).ToArray();
    readonly DataGridColumn[] columns = [new() { Id = "id", Label = "ID", Width = 110 }, new() { Id = "status", Label = "Status", Width = 140 }, new() { Id = "severity", Label = "Severity", Width = 140 }, new() { Id = "title", Label = "Title", Width = 240 }, new() { Id = "details", Label = "Details", Width = 350 }, new() { Id = "owner", Label = "Owner", Width = 140 }];
    readonly Dictionary<string, Blob> headers = new();
    public int HeaderCount => headers.Count;
    public override Blob Build() => Cell.Mount<DataGridInput, DataGrid>(null, new DataGridInput { Rows = rows, Columns = columns, Width = 1200, Height = 800, RowHeight = 32, AutoRowHeight = true, MaximumRowHeight = 76, ViewportHandle = Viewport, CreateCellContent = Content, CreateHeader = reuse ? Header : null });
    Blob Header(DataGridInput input, DataGridColumn column, Blob content)
    {
        if (headers.TryGetValue(column.Id!, out var cached)) return cached;
        headers.Add(column.Id!, content);
        return content;
    }
    static Blob Content(DataGridInput input, DataGridRow row, DataGridColumn column) => new Text { Content = column.Id == "details" ? $"Finding {row.SourceIndex}: verify access control for this service and document the evidence. This wrapped description fills several lines in the narrow details column." : $"{column.Id} {row.SourceIndex}", FontFamily = "Vend Sans", FontSize = 14, TextWrap = column.Id == "details" ? TextWrap.Wrap : TextWrap.NoWrap };
}
