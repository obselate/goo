using System.Runtime.InteropServices;
using Android.Runtime;
using Android.Views;

namespace Goo.Android;

internal sealed class AndroidVulkanHost(GooView view) : EmbeddedWindowHost
{
    private nint library;
    private nint nativeWindow;

    internal void AcquireSurface(Surface surface)
    {
        if (nativeWindow != 0)
            throw new InvalidOperationException("An Android native window is already attached.");
        nativeWindow = ANativeWindow_fromSurface(JNIEnv.Handle, surface.Handle);
        if (nativeWindow == 0)
            throw new InvalidOperationException("Android did not provide a native Vulkan window.");
    }

    internal void ReleaseSurface()
    {
        if (nativeWindow == 0)
            return;
        ANativeWindow_release(nativeWindow);
        nativeWindow = 0;
    }

    internal void RefreshSurface(Surface surface)
    {
        var next = ANativeWindow_fromSurface(JNIEnv.Handle, surface.Handle);
        if (next == 0)
            throw new InvalidOperationException("Android did not provide a resized native window.");
        if (next == nativeWindow)
        {
            ANativeWindow_release(next);
            return;
        }
        try
        {
            DetachPresentation();
        }
        catch
        {
            ANativeWindow_release(next);
            throw;
        }
        ReleaseSurface();
        nativeWindow = next;
    }

    protected override nint GetNativeHandle() => nativeWindow;
    protected override bool PreferRequestedFramebufferExtent() => true;
    protected override bool AllowInheritedCompositeAlpha() => true;
    protected override bool StartTextInput() => view.BeginTextInput();
    protected override void StopTextInput() => view.EndTextInput();
    protected override bool SetImeArea(int x, int y, int width, int height, int cursor) => view.SetImeArea(x, y, width, height);
    protected override string GetClipboardText() => view.GetClipboardText();
    protected override void SetClipboardText(string value) => view.SetClipboardText(value);
    protected override void RequestFrame() => view.RequestFrame();
    protected override bool LoadVulkanLibrary() => NativeLibrary.TryLoad("libvulkan.so", out library);
    protected override nint GetVulkanGetInstanceProcAddr() => NativeLibrary.GetExport(library, "vkGetInstanceProcAddr");
    protected override string[] GetVulkanInstanceExtensions() => ["VK_KHR_surface", "VK_KHR_android_surface"];

    protected override void UnloadVulkanLibrary()
    {
        if (library != 0)
            NativeLibrary.Free(library);
        library = 0;
    }

    protected override unsafe bool CreateVulkanSurface(nint instance, out ulong surface)
    {
        surface = 0;
        if (nativeWindow == 0)
            return false;
        var get = (delegate* unmanaged<nint, byte*, nint>)GetVulkanGetInstanceProcAddr();
        var name = "vkCreateAndroidSurfaceKHR\0"u8;
        fixed (byte* pointer = name)
        {
            var create = (delegate* unmanaged<nint, AndroidSurfaceCreateInfo*, nint, ulong*, int>)get(instance, pointer);
            if (create == null)
                return false;
            var info = new AndroidSurfaceCreateInfo { Type = 1000008000, Window = nativeWindow };
            ulong created = 0;
            var result = create(instance, &info, 0, &created);
            surface = created;
            return result == 0;
        }
    }

    protected override unsafe void DestroyVulkanSurface(nint instance, ulong surface)
    {
        var get = (delegate* unmanaged<nint, byte*, nint>)GetVulkanGetInstanceProcAddr();
        var name = "vkDestroySurfaceKHR\0"u8;
        fixed (byte* pointer = name)
        {
            var destroy = (delegate* unmanaged<nint, ulong, nint, void>)get(instance, pointer);
            if (destroy != null)
                destroy(instance, surface, 0);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AndroidSurfaceCreateInfo
    {
        public uint Type;
        public nint Next;
        public uint Flags;
        public nint Window;
    }

    [DllImport("libandroid.so")]
    private static extern nint ANativeWindow_fromSurface(nint environment, nint surface);

    [DllImport("libandroid.so")]
    private static extern void ANativeWindow_release(nint window);
}
