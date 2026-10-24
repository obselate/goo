package GooTextOutputProof

import Android.AccessibilityServices
import Android.App
import Android.Content
import Android.OS
import Android.Runtime
import System
import System.Diagnostics
import System.Diagnostics.CodeAnalysis
import System.Threading

@Instrumentation(Name = "org.goo.textoutputproof.PrintProof", TargetPackage = "org.goo.textoutputproof", FunctionalTest = true)
class PrintProof : Instrumentation {
    public init(handle nint, ownership JniHandleOwnership) : base(handle, ownership) {}

    @DynamicDependency(DynamicallyAccessedMemberTypes.PublicConstructors, typeof(PrintProof))
    public override func OnCreate(arguments Bundle?) {
        base.OnCreate(arguments)
        Start()
    }

    public override func OnStart() {
        let result = Bundle()
        try {
            using let info = UiAutomation!!.ServiceInfo!!
            info.Flags |= AccessibilityServiceFlags.ReportViewIds
            this.UiAutomation!!.ServiceInfo = info
            let context = TargetContext ?? throw InvalidOperationException("The Android test context is missing")
            MainActivity.Printed = nil
            MainActivity.Failure = ""
            MainActivity.PausedPage = false
            MainActivity.PagesCreated = 0
            using let launch = Intent(context, typeof(MainActivity))
            launch.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask)
            context.StartActivity(launch)
            Click("com.android.printspooler:id/destination_spinner", "")
            Click("", "Save as PDF")
            Click("com.android.printspooler:id/print_button", "")
            Click("android:id/button1", "")
            let deadline = Stopwatch.StartNew()
            while MainActivity.Printed == nil && MainActivity.Failure.Length == 0 && deadline.Elapsed < TimeSpan.FromSeconds(60) {
                Thread.Sleep(50)
            }
            MainActivity.Require(MainActivity.Failure.Length == 0, MainActivity.Failure)
            MainActivity.Require(MainActivity.Printed?.Status == Goo.Printing.PrintStatus.Submitted, "PrintManager did not accept the document")
            result.PutString("stream", "PASS: native Android checker callbacks and Save as PDF submission\n")
            Finish(Result.Ok, result)
        } catch (error Exception) {
            result.PutString("stream", "FAIL: " + error.ToString() + "\n")
            Finish(Result.Canceled, result)
        }
    }

    private func Click(viewId string, text string) {
        let deadline = Stopwatch.StartNew()
        while deadline.Elapsed < TimeSpan.FromSeconds(90) {
            MainActivity.Require(MainActivity.Failure.Length == 0, MainActivity.Failure)
            using let root = UiAutomation!!.RootInActiveWindow
            let nodes = if viewId.Length != 0 { root?.FindAccessibilityNodeInfosByViewId(viewId) }
                else { root?.FindAccessibilityNodeInfosByText(text) }
            var clicked = false
            if nodes != nil {
                for node in nodes {
                    using let ownedNode = node
                    if clicked || !node.Enabled || text.Length != 0 && node.Text?.ToString() != text { continue }
                    var target = node
                    while !target.Clickable && target.Parent is {} parent {
                        if !ReferenceEquals(target, node) { target.Dispose() }
                        target = parent
                    }
                    if target.Enabled && target.Clickable {
                        clicked = target.PerformAction(Android.Views.Accessibility.Action.Click)
                    }
                    if !ReferenceEquals(target, node) { target.Dispose() }
                }
            }
            if clicked { return }
            Thread.Sleep(50)
        }
        throw InvalidOperationException("Native print control did not become ready: " + viewId + text)
    }
}
