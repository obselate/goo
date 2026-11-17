using Goo;
using Goo.Widgets.Data;
using Goo.Widgets.Inputs;
using Goo.Widgets.Layout;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using Blob = Goo.Blob;

namespace Interop.CSharp;

internal static class Program
{
    private static void Main(string[] args)
    {
        if (args.Contains("--check"))
        {
            Check();
            return;
        }
        var window = new Window
        {
            Title = "C# interop",
            Size = new LayoutSize(640, 480),
            Root = new Examples(args.FirstOrDefault() ?? "counter")
        };
        Goo.Widgets.Theme.Attach(window);
        Goo.Widgets.Theme.SetMode(window, Goo.Widgets.ThemeMode.Dark);
        Action<bool> focused = value => Console.WriteLine($"Focused: {value}");
        window.FocusChanged += focused;
        window.FocusChanged -= focused;
        Application.Run(window);
    }

    private static void Check()
    {
        var counter = new Counter();
        var percent = Length.Percent(25);
        var relative = Length.Em(2);
        var zero = relative * 3 - Length.Em(6);
        if (!percent.IsPercent || percent.Magnitude != 25 || relative.HasMagnitude || !zero.HasMagnitude || zero.Magnitude != 0)
            throw new InvalidOperationException("Length interop failed.");
        ((Button)((Container)counter.Build()).Children[1]).OnClick!();
        if (((Text)((Container)counter.Build()).Children[0]).Content != "Count: 1")
            throw new InvalidOperationException("Counter failed.");
        if (Examples.List(["Ada", "Grace"]).Children.Count != 4)
            throw new InvalidOperationException("Spread failed.");
        foreach (var path in Directory.GetFiles(AppContext.BaseDirectory, "Goo*.dll"))
        {
            using var stream = File.OpenRead(path);
            using var assembly = new PEReader(stream);
            var metadata = assembly.GetMetadataReader();
            if (metadata.AssemblyReferences.Any(reference =>
                    metadata.GetString(metadata.GetAssemblyReference(reference).Name) == "Gsharp.Runtime.Channels"))
                throw new InvalidOperationException($"{Path.GetFileName(path)} references an SDK-internal channel runtime.");
        }
        CheckAsyncDispatcher();
        Console.WriteLine("C# interop checks passed.");
    }

    private static void CheckAsyncDispatcher()
    {
        using var host = new DispatcherCheckHost();
        host.Resize(100, 100, 100, 100);
        var dispatcher = new Window().Attach(host);
        var pending = new TaskCompletionSource<bool>();
        var value = new TaskCompletionSource<int>();
        var requestCount = host.RequestCount;
        Task<int> result = dispatcher.InvokeAsync(async () =>
        {
            await pending.Task;
            return 42;
        });
        Task<int> forwarded = dispatcher.InvokeAsync(() => value.Task);
        host.RenderFrame(0);
        if (host.RequestCount <= requestCount)
            throw new InvalidOperationException("Async dispatch did not request frame service.");
        if (result.IsCompleted || forwarded.IsCompleted)
            throw new InvalidOperationException("Async dispatch completed before its work.");
        pending.SetResult(true);
        value.SetResult(43);
        host.RenderFrame(0);
        if (!Task.WaitAll([result, forwarded], TimeSpan.FromSeconds(5))
            || result.Result != 42 || forwarded.Result != 43)
            throw new InvalidOperationException("Async dispatch did not await its result.");
    }
}

file sealed class DispatcherCheckHost : EmbeddedWindowHost
{
    private int requests;
    internal int RequestCount => Volatile.Read(ref requests);
    protected override void RequestFrame() => Interlocked.Increment(ref requests);
    protected override bool LoadVulkanLibrary() => throw new NotSupportedException();
    protected override nint GetVulkanGetInstanceProcAddr() => throw new NotSupportedException();
    protected override void UnloadVulkanLibrary() => throw new NotSupportedException();
    protected override string[] GetVulkanInstanceExtensions() => throw new NotSupportedException();
    protected override bool CreateVulkanSurface(nint instance, out ulong surface) => throw new NotSupportedException();
    protected override void DestroyVulkanSurface(nint instance, ulong surface) => throw new NotSupportedException();
}

internal static class AppTheme
{
    internal static readonly Color Background = Color.Rgb(24, 31, 43);
    internal static readonly Color Foreground = Color.Rgb(240, 244, 252);
    internal static readonly Color Accent = Color.Parse("#4a7dff");
    internal static readonly Style Panel = new() { Width = Length.Percent(100), Height = Length.Percent(100), Padding = 24, Gap = 12, BackgroundColor = Background, Color = Foreground };
    internal static readonly Style Button = new() { Padding = 10, BorderRadius = 8, BackgroundColor = Accent, Color = Foreground };
}

public sealed class Counter : Cell
{
    private readonly State<int> count = new(0);
    private readonly ElementHandle addButton = new();

    public override Blob Build() => new Container
    {
        BasedOn = AppTheme.Panel,
        Children =
        [
            new Text { Content = $"Count: {count.Value}" },
            new Button
            {
                BasedOn = AppTheme.Button,
                Handle = addButton,
                KeyBindings =
                [
                    new(Key.Enter, KeyModifiers.None, () => addButton.Activate()),
                    new(Key.Space, KeyModifiers.None, () => addButton.BeginPress())
                    {
                        OnRelease = () => addButton.EndPress(true)
                    }
                ],
                OnClick = () => count.Value++,
                Children = [new Text { Content = "Add one" }]
            }
        ]
    };
}

public sealed record AccountInput(string Name);

public sealed class AccountCell : Cell<AccountInput>
{
    private readonly State<int> edits = new(0);
    protected override Blob Build(AccountInput input) => new Button
    {
        BasedOn = AppTheme.Button,
        OnClick = () => edits.Value++,
        Children = [new Text { Content = $"{input.Name}: {edits.Value}" }]
    };
}

public sealed class InputCell : Cell
{
    private readonly State<string> name = new("Ada");
    private readonly State<string> saved = new("");
    private readonly ElementHandle field = new();

    public override Blob Build() => new Container
    {
        BasedOn = AppTheme.Panel,
        KeyBindings = [new(Key.S, KeyModifiers.Primary, Save)],
        Children =
        [
            new TextField
            {
                Label = "Name", Value = name.Value, Handle = field,
                OnChange = value => name.Value = value, OnSubmit = _ => Save()
            },
            new Button { BasedOn = AppTheme.Button, OnClick = () => field.Focus(), Children = [new Text { Content = "Focus name" }] },
            new Text { Content = saved.Value }
        ]
    };

    private void Save() => saved.Value = $"Saved: {name.Value}";
}

public sealed class LoadCell : Cell
{
    private readonly State<string> status = new("Ready");

    public override Blob Build() => new Container
    {
        BasedOn = AppTheme.Panel,
        Children =
        [
            new Button { BasedOn = AppTheme.Button, OnClick = Load, Children = [new Text { Content = "Load" }] },
            new Text { Content = status.Value }
        ]
    };

    private async void Load()
    {
        var token = Latest("load");
        status.Value = "Loading";
        try
        {
            var result = await Task.Run(() => ReadRuntime(token), token);
            if (!token.IsCancellationRequested)
                status.Value = result;
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception error) { status.Value = error.Message; }
    }

    private string ReadRuntime(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        Post(() => status.Value = "Reading runtime");
        return $".NET {Environment.Version}";
    }
}

public sealed class Examples(string sample) : Cell
{
    private bool open;
    private readonly string[] items = sample == "virtual"
        ? Enumerable.Range(0, 10_000).Select(i => $"Item {i:D5}").ToArray()
        : [];
    private static readonly Func<string, string> ItemKey = value => value;
    private static readonly Func<string, Blob> BuildRow = value => new Text { Content = value, Color = AppTheme.Foreground };

    public static Container List(IEnumerable<string> data)
    {
        var rows = data.Select(value => (Blob)new Text { Key = value, Content = value });
        return new Container
        {
            BasedOn = AppTheme.Panel,
            MaxWidth = Length.Percent(100),
            Children = [new Text { Content = "Account" }, ..rows,
                Cell.Mount<AccountInput, AccountCell>("account", new("Ada"))]
        };
    }

    public override Blob Build()
    {
        if (sample == "virtual")
        {
            var list = VirtualLists.Rows(items, 24, ItemKey, BuildRow);
            list.FlexGrow = 1;
            list.MinHeight = 0;
            list.ScrollbarVisibility = ScrollbarVisibility.Always;
            return new Container { BasedOn = AppTheme.Panel, Children = [list] };
        }
        return sample switch
        {
            "list" => List(["Ada", "Grace", "Linus"]),
            "input" => Cell.Mount<InputCell>("input"),
            "load" => Cell.Mount<LoadCell>("load"),
            "layout" => new Container
            {
                BasedOn = AppTheme.Panel,
                Children =
                [
                    new Container
                    {
                        Height = 200, Layout = new EqualColumn(),
                        Children = [new Text { Content = "One" }, new Text { Content = "Two" }]
                    }
                ]
            },
            "variants" => new Container
            {
                BasedOn = AppTheme.Panel,
                Children =
                {
                    new Button { BasedOn = AppTheme.Button, Children = [new Text { Content = "Base" }] },
                    new Button { BasedOn = AppTheme.Button, Padding = Length.Em(1), BackgroundColor = AppTheme.Background,
                        Children = [new Text { Content = "Override" }] }
                }
            },
            "dialog" => new Container
            {
                BasedOn = AppTheme.Panel,
                Children =
                [
                    new Button { BasedOn = AppTheme.Button, OnClick = () => open = true, Children = [new Text { Content = "Open dialog" }] },
                    Cell.Mount<ModalDialog, ModalDialogHost>("dialog", new ModalDialog
                    {
                        Open = open, Content = new Text { Content = "Save account?" }, Padding = 20,
                        OnOpenChange = value => open = value, OnCancel = Close, OnConfirm = Close
                    })
                ]
            },
            _ => Cell.Mount<Counter>("counter")
        };
    }

    private void Close() => open = false;

    public static TextPosition? HitTest(ElementHandle handle, Point point) =>
        handle.TryGetTextPositionAt(point, TextCoordinateSpace.Window, out var position) ? position : null;

    public static async Task<FileDialogResult> PickFile(Window window) =>
        await window.ShowFileDialogAsync(FileDialogKind.OpenFile);
}

public sealed class EqualColumn : LayoutAlgorithm
{
    public LayoutSize Measure(LayoutContext context, LayoutSize available)
    {
        double width = 0, height = 0;
        for (var i = 0; i < context.ChildCount; i++)
        {
            var child = context.MeasureChild(i, available);
            width = Math.Max(width, child.Width);
            height += child.Height;
        }
        return new LayoutSize { Width = Math.Min(width, available.Width), Height = Math.Min(height, available.Height) };
    }

    public void Arrange(LayoutContext context, LayoutSize finalSize)
    {
        var height = context.ChildCount == 0 ? 0 : finalSize.Height / context.ChildCount;
        for (var i = 0; i < context.ChildCount; i++)
            context.ArrangeChild(i, new ElementRect { Y = i * height, Width = finalSize.Width, Height = height });
    }
}
