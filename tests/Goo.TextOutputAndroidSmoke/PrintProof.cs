using Android.AccessibilityServices;
using Android.App;
using Android.Content;
using Android.OS;
using System.Diagnostics.CodeAnalysis;
using System.Diagnostics;

namespace GooTextOutputProof;

[Instrumentation(Name = "org.goo.textoutputproof.PrintProof", TargetPackage = "org.goo.textoutputproof", FunctionalTest = true)]
public sealed class PrintProof : Instrumentation
{
    public PrintProof(nint handle, Android.Runtime.JniHandleOwnership ownership) : base(handle, ownership) { }

    [DynamicDependency(DynamicallyAccessedMemberTypes.PublicConstructors, typeof(PrintProof))]
    public override void OnCreate(Bundle? arguments)
    {
        base.OnCreate(arguments);
        Start();
    }

    public override void OnStart()
    {
        var result = new Bundle();
        try
        {
            using var info = UiAutomation!.ServiceInfo!;
            info.Flags |= AccessibilityServiceFlags.ReportViewIds;
            UiAutomation.ServiceInfo = info;
            var context = TargetContext ?? throw new InvalidOperationException("The Android test context is missing");
            MainActivity.Printed = null;
            MainActivity.Failure = "";
            MainActivity.PausedPage = false;
            MainActivity.PagesCreated = 0;
            using var launch = new Intent(context, typeof(MainActivity));
            launch.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            context.StartActivity(launch);
            Click("com.android.printspooler:id/destination_spinner", "");
            Click("", "Save as PDF");
            Click("com.android.printspooler:id/print_button", "");
            Click("android:id/button1", "");
            var deadline = Stopwatch.StartNew();
            while (MainActivity.Printed == null && MainActivity.Failure.Length == 0 && deadline.Elapsed < TimeSpan.FromSeconds(60))
                Thread.Sleep(50);
            MainActivity.Require(MainActivity.Failure.Length == 0, MainActivity.Failure);
            MainActivity.Require(MainActivity.Printed?.Status == Goo.Printing.PrintStatus.Submitted, "PrintManager did not accept the document");
            result.PutString("stream", "PASS: native Android checker callbacks and Save as PDF submission\n");
            Finish(Result.Ok, result);
        }
        catch (Exception error)
        {
            result.PutString("stream", "FAIL: " + error + "\n");
            Finish(Result.Canceled, result);
        }
    }

    private void Click(string viewId, string text)
    {
        var deadline = Stopwatch.StartNew();
        while (deadline.Elapsed < TimeSpan.FromSeconds(90))
        {
            MainActivity.Require(MainActivity.Failure.Length == 0, MainActivity.Failure);
            using var root = UiAutomation!.RootInActiveWindow;
            var nodes = viewId.Length != 0 ? root?.FindAccessibilityNodeInfosByViewId(viewId)
                : root?.FindAccessibilityNodeInfosByText(text);
            var clicked = false;
            foreach (var node in nodes ?? [])
            {
                using (node)
                {
                    if (clicked || !node.Enabled || text.Length != 0 && node.Text?.ToString() != text) continue;
                    var target = node;
                    while (!target.Clickable && target.Parent is { } parent)
                    {
                        if (!ReferenceEquals(target, node)) target.Dispose();
                        target = parent;
                    }
                    if (target.Enabled && target.Clickable)
                        clicked = target.PerformAction(global::Android.Views.Accessibility.Action.Click);
                    if (!ReferenceEquals(target, node)) target.Dispose();
                }
            }
            if (clicked) return;
            Thread.Sleep(50);
        }
        throw new InvalidOperationException("Native print control did not become ready: " + viewId + text);
    }
}
