package GooAndroidSmokeApp

import Android.App
import Android.Content
import Android.OS
import Android.Runtime
import Android.Views
import Goo
import Goo.Gestures
import System
import System.Collections.Generic
import System.Threading

@Instrumentation(
    Name = "org.goo.androidsmoke.GestureChecks",
    TargetPackage = "org.goo.androidsmoke",
    FunctionalTest = true
)
class GestureChecks : Instrumentation {
    init() { }

    init(handle nint, ownership JniHandleOwnership) : base(handle, ownership) { }

    override func OnCreate(arguments Bundle?) {
        base.OnCreate(arguments)
        Start()
    }

    override func OnStart() {
        using let result = Bundle()
        var status = Result.Ok
        try {
            using let intent = Intent(TargetContext!!, typeof(MainActivity))
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask)
            intent.PutExtra("goo.gesture_smoke", true)
            let activity = cast[MainActivity](StartActivitySync(intent)!!)
            let view = activity.NativeView
            let scene = view
                .Window
                .Root as GestureCheckScene ??
                throw InvalidOperationException("Android gesture scene is unavailable.")
            var mounted = false
            for var attempt = 0; attempt < 300 && !mounted; attempt++ {
                RunOnMainSync(
                    () -> {
                        mounted = scene.Handle.IsMounted && view.Width > 0 && view.Height > 0
                    }
                )
                if !mounted {
                    Thread.Sleep(50)
                }
            }
            Require(mounted, "Gesture scene did not mount on Android Vulkan.")
            let location = [2]int32
            var density = 1f
            RunOnMainSync(
                () -> {
                    view.GetLocationOnScreen(location)
                    density = view.Resources!!.DisplayMetrics!!.Density
                }
            )
            var downTime = SystemClock.UptimeMillis()
            using let first = MotionEvent.PointerProperties{Id: 0, ToolType: MotionEventToolType.Finger}
            using let second = MotionEvent.PointerProperties{Id: 1, ToolType: MotionEventToolType.Finger}
            using let firstPoint = MotionEvent.PointerCoords{Pressure: 1.0f, Size: 1.0f}
            using let secondPoint = MotionEvent.PointerCoords{Pressure: 1.0f, Size: 1.0f}
            let Inject = (action MotionEventActions, count int32, x1 float32, y1 float32, x2 float32, y2 float32) -> {
                firstPoint.X = float32(location[0]) + x1 * density
                firstPoint.Y = float32(location[1]) + y1 * density
                secondPoint.X = float32(location[0]) + x2 * density
                secondPoint.Y = float32(location[1]) + y2 * density
                using let motion = MotionEvent.Obtain(
                    downTime,
                    SystemClock.UptimeMillis(),
                    action,
                    count,
                    if count == 1 {
                        []MotionEvent.PointerProperties{first}
                    } else {
                        []MotionEvent.PointerProperties{first, second}
                    },
                    if count == 1 {
                        []MotionEvent.PointerCoords{firstPoint}
                    } else {
                        []MotionEvent.PointerCoords{firstPoint, secondPoint}
                    },
                    MetaKeyStates(0),
                    MotionEventButtonState(0),
                    1.0f,
                    1.0f,
                    0,
                    Edge(0),
                    InputSourceType.Touchscreen,
                    MotionEventFlags(0)
                )!!
                Require(UiAutomation!!.InjectInputEvent(motion, true), "Android touch injection failed.")
            }
            Inject(MotionEventActions.Down, 1, 80.0f, 80.0f, 180.0f, 80.0f)
            Inject(MotionEventActions((int32(MotionEventActions.PointerDown) | 1 << 8)), 2, 80.0f, 80.0f, 180.0f, 80.0f)
            Inject(MotionEventActions.Move, 2, 100.0f, 110.0f, 200.0f, 110.0f)
            RunOnMainSync(
                () -> {
                    Require(scene.Events.Count == 2, "Android move emitted more than one accepted gesture update.")
                    var moved = scene.Events[1]
                    Require(
                        Math.Abs(moved.Scale - float64(1.0)) < 0.0001 && Math.Abs(moved.Rotation.Radians) < 0.0001,
                        "A translated contact pair changed scale or rotation."
                    )
                    Require(
                        Math.Abs(moved.Translation.X - float64(20.0)) < 0.001 && Math.Abs(
                            moved.Translation.Y - float64(30.0)
                        ) < 0.001,
                        "Android contact-frame translation changed."
                    )
                }
            )
            Inject(MotionEventActions.Move, 2, 100.0f, 110.0f, 100.0f, 210.0f)
            Inject(
                MotionEventActions((int32(MotionEventActions.PointerUp) | 1 << 8)),
                2,
                100.0f,
                110.0f,
                100.0f,
                210.0f
            )
            Inject(MotionEventActions.Up, 1, 100.0f, 110.0f, 100.0f, 210.0f)
            RunOnMainSync(
                () -> {
                    Require(
                        scene.Events.Count == 4 && scene.Events[3].Phase == GesturePhase.Completed,
                        "Android pair release did not complete exactly once."
                    )
                    Require(
                        Math.Abs(scene.Events[2].Rotation.Radians - Math.PI / float64(2.0)) < 0.001,
                        "Android contact rotation changed."
                    )
                }
            )
            downTime = SystemClock.UptimeMillis()
            Inject(MotionEventActions.Down, 1, 80.0f, 80.0f, 180.0f, 80.0f)
            Inject(MotionEventActions((int32(MotionEventActions.PointerDown) | 1 << 8)), 2, 80.0f, 80.0f, 180.0f, 80.0f)
            Inject(MotionEventActions.Cancel, 2, 80.0f, 80.0f, 180.0f, 80.0f)
            RunOnMainSync(
                () -> Require(
                    scene.Events.Count == 6 && scene.Events[5].Phase == GesturePhase.Canceled && scene.Clicks == 0,
                    "Android cancellation emitted a click or repeated terminal event."
                )
            )
            result.PutString("stream", "GOO_GESTURES_PASS coherent_move=1 rotation=90 cancellation=verified\n")
        } catch (error Exception) {
            result.PutString("stream", "GOO_GESTURES_FAIL\n" + error.ToString() + "\n")
            status = Result.Canceled
        }
        Finish(status, result)
    }

    shared {
        private func Require(condition bool, message string) {
            if !condition {
                throw InvalidOperationException(message)
            }
        }
    }
}

internal class GestureCheckScene : Cell {
    internal let Handle ElementHandle = ElementHandle()
    internal let Events List[TransformGestureEvent] = List[TransformGestureEvent]()
    internal var Clicks int32
    private let gestures[]GestureRecognizer

    internal init() {
        gestures = []GestureRecognizer{TransformGesture(Events.Add)}
    }

    override func Build() Blob {
        let root = Container{Handle: Handle, Width: 300, Height: 300, Gestures: gestures, OnClick: () -> Clicks++}
        root.Children.Add(Text{Content: "Android gesture check", Color: Color.White, FontSize: 24})
        return root
    }
}
