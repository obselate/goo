using Goo;
using Goo.Widgets.Data;
using Goo.Widgets.Layout;

var window = new Window
{
    Title = "C# interop", Width = 640, Height = 480,
    Root = new Examples(args.FirstOrDefault() ?? "counter")
};
Action<bool> focused = value => Console.WriteLine($"Focused: {value}");
window.FocusChanged += focused;
window.FocusChanged -= focused;
if (args.Contains("--check"))
{
    var counter = new Counter();
    ((Button)((Container)counter.Build()).Children[1]).OnClick!();
    if (((Text)((Container)counter.Build()).Children[0]).Content != "Count: 1")
        throw new InvalidOperationException("Counter failed.");
    if (Examples.List(["Ada", "Grace"]).Children.Count != 4) throw new InvalidOperationException("Spread failed.");
    Console.WriteLine("C# interop checks passed.");
}
else window.Run();

public sealed class Counter : Cell
{
    private int count;
    public override Blob Build() => new Container
    {
        Padding = 24, Gap = 12,
        Children =
        [
            new Text { Content = $"Count: {count}" },
            new Button
            {
                Padding = 10, BorderRadius = 10,
                TransitionMs = 150, Hover = new Style { BackgroundColor = Color.Rgb(74, 125, 255) },
                OnClick = () => { count++; Rebuild(); },
                Children = [new Text { Content = "Add one" }]
            }
        ]
    };
}

public sealed record AccountInput(string Name);
public sealed class AccountCell : Cell<AccountInput>
{
    private int edits;
    protected override Blob Build(AccountInput input) => new Button
    {
        OnClick = () => { edits++; Rebuild(); },
        Children = [new Text { Content = $"{input.Name}: {edits}" }]
    };
}

public sealed class Examples(string sample) : Cell
{
    private bool open;
    private readonly string[] items = sample == "virtual"
        ? Enumerable.Range(0, 10_000).Select(i => $"Item {i:D5}").ToArray()
        : [];
    private static readonly Func<string, string> ItemKey = value => value;
    private static readonly Func<string, Blob> BuildRow = value => new Text { Content = value };

    public static Container List(IEnumerable<string> data)
    {
        var rows = data.Select(value => (Blob)new Text { Key = value, Content = value });
        return new Container
        {
            Width = Length.Pixels(320), MaxWidth = Length.Percent(100), Padding = 12, Gap = 8,
            Children = [new Text { Content = "Account" }, ..rows,
                new Button { OnClick = () => Console.WriteLine("Save"), Children = [new Text { Content = "Save" }] }]
        };
    }

    public override Blob Build()
    {
        switch (sample)
        {
            case "list": return List(["Ada", "Grace", "Linus"]);
            case "input": return Cell.Mount<AccountInput, AccountCell>("account", new("Ada"));
            case "virtual": return VirtualLists.Rows(items, 24, ItemKey, BuildRow);
            case "variants":
                var basic = new Style { Padding = 10, BorderRadius = 10, BackgroundColor = Color.Rgb(24, 31, 43) };
                return new Container
                {
                    Gap = 12,
                    Children =
                    [
                        new Button { BasedOn = basic, Children = [new Text { Content = "Base" }] },
                        new Button
                        {
                            BasedOn = basic, BackgroundColor = Color.Rgb(74, 125, 255),
                            Children = [new Text { Content = "Primary" }]
                        }
                    ]
                };
            case "layout":
                return new Container
                {
                    Height = 200, Layout = new EqualColumn(),
                    Children = [new Text { Content = "One" }, new Text { Content = "Two" }]
                };
            case "dialog":
                return new Container
                {
                    Children =
                    [
                        new Button
                        {
                            OnClick = () => { open = true; Rebuild(); },
                            Children = [new Text { Content = "Open dialog" }]
                        },
                        Cell.Mount<ModalDialog, ModalDialogHost>("dialog", new ModalDialog
                        {
                            Open = open, Content = new Text { Content = "Save account?" }, Padding = 20,
                            OnClose = Close, OnCancel = Close, OnConfirm = Close
                        })
                    ]
                };
            default: return Cell.Mount<Counter>("counter");
        }
    }

    private void Close() { open = false; Rebuild(); }

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
