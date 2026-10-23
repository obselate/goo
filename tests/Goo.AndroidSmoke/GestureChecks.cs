using Android.App;
using Android.Content;
using Android.OS;
using Android.Views;
using Goo;
using Goo.Gestures;

namespace GooAndroidSmokeApp;

[Instrumentation(Name = "org.goo.androidsmoke.GestureChecks", TargetPackage = "org.goo.androidsmoke", FunctionalTest = true)]
public sealed class GestureChecks : Instrumentation
{
    public GestureChecks() { }
    public GestureChecks(IntPtr handle, global::Android.Runtime.JniHandleOwnership ownership) : base(handle, ownership) { }

    public override void OnCreate(Bundle? arguments)
    {
        base.OnCreate(arguments);
        Start();
    }

    public override void OnStart()
    {
        using var result = new Bundle();
        var status = Result.Ok;
        try
        {
            using var intent = new Intent(TargetContext!, typeof(MainActivity));
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            intent.PutExtra("goo.gesture_smoke", true);
            var activity = (MainActivity)StartActivitySync(intent)!;
            var view = activity.NativeView;
            var scene = view.Window.Root as GestureCheckScene
                ?? throw new InvalidOperationException("Android gesture scene is unavailable.");
            var mounted = false;
            for (var attempt = 0; attempt < 300 && !mounted; attempt++)
            {
                RunOnMainSync(() => mounted = scene.Handle.IsMounted && view.Width > 0 && view.Height > 0);
                if (!mounted) Thread.Sleep(50);
            }
            Require(mounted, "Gesture scene did not mount on Android Vulkan.");
            var location = new int[2];
            var density = 1f;
            RunOnMainSync(() => { view.GetLocationOnScreen(location); density = view.Resources!.DisplayMetrics!.Density; });
            var downTime = SystemClock.UptimeMillis();
            using var first = new MotionEvent.PointerProperties { Id = 0, ToolType = MotionEventToolType.Finger };
            using var second = new MotionEvent.PointerProperties { Id = 1, ToolType = MotionEventToolType.Finger };
            using var firstPoint = new MotionEvent.PointerCoords { Pressure = 1, Size = 1 };
            using var secondPoint = new MotionEvent.PointerCoords { Pressure = 1, Size = 1 };
            Inject(MotionEventActions.Down, 1, 80, 80, 180, 80);
            Inject((MotionEventActions)((int)MotionEventActions.PointerDown | 1 << 8), 2, 80, 80, 180, 80);
            Inject(MotionEventActions.Move, 2, 100, 110, 200, 110);
            RunOnMainSync(() =>
            {
                Require(scene.Events.Count == 2, "Android move emitted more than one accepted gesture update.");
                var moved = scene.Events[1];
                Require(Math.Abs(moved.Scale - 1) < 0.0001 && Math.Abs(moved.Rotation.Radians) < 0.0001,
                    "A translated contact pair changed scale or rotation.");
                Require(Math.Abs(moved.Translation.X - 20) < 0.001 && Math.Abs(moved.Translation.Y - 30) < 0.001,
                    "Android contact-frame translation changed.");
            });
            Inject(MotionEventActions.Move, 2, 100, 110, 100, 210);
            Inject((MotionEventActions)((int)MotionEventActions.PointerUp | 1 << 8), 2, 100, 110, 100, 210);
            Inject(MotionEventActions.Up, 1, 100, 110, 100, 210);
            RunOnMainSync(() =>
            {
                Require(scene.Events.Count == 4 && scene.Events[3].Phase == GesturePhase.Completed,
                    "Android pair release did not complete exactly once.");
                Require(Math.Abs(scene.Events[2].Rotation.Radians - Math.PI / 2) < 0.001,
                    "Android contact rotation changed.");
            });
            downTime = SystemClock.UptimeMillis();
            Inject(MotionEventActions.Down, 1, 80, 80, 180, 80);
            Inject((MotionEventActions)((int)MotionEventActions.PointerDown | 1 << 8), 2, 80, 80, 180, 80);
            Inject(MotionEventActions.Cancel, 2, 80, 80, 180, 80);
            RunOnMainSync(() => Require(scene.Events.Count == 6 && scene.Events[5].Phase == GesturePhase.Canceled
                && scene.Clicks == 0, "Android cancellation emitted a click or repeated terminal event."));
            result.PutString("stream", "GOO_GESTURES_PASS coherent_move=1 rotation=90 cancellation=verified\n");

            void Inject(MotionEventActions action, int count, float x1, float y1, float x2, float y2)
            {
                firstPoint.X = location[0] + x1 * density;
                firstPoint.Y = location[1] + y1 * density;
                secondPoint.X = location[0] + x2 * density;
                secondPoint.Y = location[1] + y2 * density;
                using var motion = MotionEvent.Obtain(downTime, SystemClock.UptimeMillis(), action, count,
                    count == 1 ? [first] : [first, second], count == 1 ? [firstPoint] : [firstPoint, secondPoint],
                    0, 0, 1, 1, 0, 0, InputSourceType.Touchscreen, 0)!;
                Require(UiAutomation!.InjectInputEvent(motion, true), "Android touch injection failed.");
            }
        }
        catch (Exception error)
        {
            result.PutString("stream", "GOO_GESTURES_FAIL\n" + error + "\n");
            status = Result.Canceled;
        }
        Finish(status, result);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}

internal sealed class GestureCheckScene : Cell
{
    internal readonly ElementHandle Handle = new();
    internal readonly List<TransformGestureEvent> Events = [];
    internal int Clicks;
    private readonly GestureRecognizer[] gestures;

    internal GestureCheckScene() => gestures = [new TransformGesture(Events.Add)];

    public override Blob Build()
    {
        var root = new Container
        {
            Handle = Handle,
            Width = 300,
            Height = 300,
            Gestures = gestures,
            OnClick = () => Clicks++
        };
        root.Children.Add(new Text { Content = "Android gesture check", Color = Color.White, FontSize = 24 });
        return root;
    }
}
