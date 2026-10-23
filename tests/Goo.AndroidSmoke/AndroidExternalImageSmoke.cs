using System.Runtime.InteropServices;
using Android.Graphics;
using Android.OS;
using Android.Views;
using Goo;
using Goo.Android;
using GooAndroidSmoke;
using Environment = System.Environment;

namespace GooAndroidSmokeApp;

internal static class AndroidExternalImageSmoke
{
    private const ulong SampledWrite = 0x100 | 0x30;

    internal static async Task Run(GooView view, ExternalImageSmokeCell scene)
    {
        try
        {
            ExternalImageSessionResult opened;
            do
            {
                await Task.Delay(50);
                opened = ExternalImageSession.Open(view.Window);
            } while (opened.Status == ExternalImageStatus.Busy);
            Require(opened.Status == ExternalImageStatus.Success, "session " + opened.Status);
            using var session = opened.Session!;
            await VerifyAllocated(view, scene, session, false);
            await VerifyAllocated(view, scene, session, true);
            await VerifyReader(view, scene, session);
            global::Android.Util.Log.Info("GooAhbSmoke", "PASS RGBA, YCbCr SDR, retained redraw, fences and ImageReader recycling");
        }
        catch (Exception error)
        {
            global::Android.Util.Log.Error("GooAhbSmoke", "FAIL " + error);
            throw;
        }
    }

    private static async Task VerifyAllocated(GooView view, ExternalImageSmokeCell scene,
        ExternalImageSession session, bool yuv)
    {
        var description = new BufferDescription { Width = 8, Height = 8, Layers = 1,
            Format = yuv ? 0x23u : 1u, Usage = SampledWrite };
        Require(Allocate(ref description, out var buffer) == 0, "allocate " + yuv);
        ExternalImageResult imported;
        try
        {
            Fill(buffer, yuv);
            imported = session.ImportAndroidHardwareBuffer(buffer);
            Require(imported.Status == ExternalImageStatus.Success, "import " + imported.Status + " " + imported.Detail);
        }
        finally { Release(buffer); }
        using var image = imported.Image!;
        var encodings = yuv ? new[] { ExternalImageColorEncoding.AndroidBt709Limited, ExternalImageColorEncoding.AndroidBt709Full,
            ExternalImageColorEncoding.AndroidBt601_625Limited, ExternalImageColorEncoding.AndroidBt601_625Full,
            ExternalImageColorEncoding.AndroidBt601_525Limited, ExternalImageColorEncoding.AndroidBt601_525Full }
            : new[] { ExternalImageColorEncoding.Srgb };
        foreach (var encoding in encodings)
        {
            using var source = session.CreateSource();
            scene.Source = source;
            scene.Opacity = 1;
            scene.Rebuild();
            var callbacks = 0;
            ExternalFrameStatus terminal = ExternalFrameStatus.Closed;
            Require(source.Publish(image, Frame(encoding), Complete(), result =>
            {
                callbacks++;
                terminal = result.Status;
                result.ReleaseSync?.Dispose();
            }) == ExternalImageStatus.Success, "publish " + encoding);
            using var capture = await Capture(view, source);
            var expected = yuv ? Expected(encoding) : new[] { 64, 128, 192 };
            VerifyPixel(capture, expected);
            scene.Opacity = 0.99f;
            scene.Rebuild();
            using var redraw = await Capture(view, source);
            VerifyPixel(redraw, expected);
            Require(callbacks == 0, "redraw recycled a displayed buffer");
            source.Dispose();
            await Until(() => callbacks == 1);
            Require(terminal == ExternalFrameStatus.Released, "release " + terminal);
            Require(callbacks == 1, "duplicate release");
            global::Android.Util.Log.Info("GooAhbSmoke", "capture " + encoding + " expected " + string.Join(',', expected));
        }
    }

    private static async Task VerifyReader(GooView view, ExternalImageSmokeCell scene, ExternalImageSession session)
    {
        Require(NewReader(8, 8, 1, 0x100, 2, out var reader) == 0, "ImageReader creation");
        var display = EglGetDisplay(0);
        nint context = 0, surface = 0;
        try
        {
            Require(GetWindow(reader, out var window) == 0, "ImageReader window");
            Require(EglInitialize(display, out _, out _) != 0, "EGL display");
            Require(EglChooseConfig(display, new[] { 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8,
                0x3033, 4, 0x3040, 4, 0x3038 }, out var config, 1, out var configs) != 0 && configs == 1, "EGL config");
            context = EglCreateContext(display, config, 0, new[] { 0x3098, 2, 0x3038 });
            surface = EglCreateWindowSurface(display, config, window, new[] { 0x3038 });
            Require(context != 0 && surface != 0 && EglMakeCurrent(display, surface, surface, context) != 0, "EGL producer");
            for (var iteration = 0; iteration < 4; iteration++)
            {
                GlClearColor(64f / 255, 128f / 255, 192f / 255, 1);
                GlClear(0x4000);
                Require(EglSwapBuffers(display, surface) != 0, "GPU producer post");
                nint nativeImage = 0;
                var fence = -1;
                await Until(() => AcquireImage(reader, out nativeImage, out fence) == 0);
                Require(GetHardwareBuffer(nativeImage, out var buffer) == 0, "ImageReader buffer");
                var imported = session.ImportAndroidHardwareBuffer(buffer);
                Require(imported.Status == ExternalImageStatus.Success, "ImageReader import " + imported.Status);
                using var image = imported.Image!;
                using var source = session.CreateSource();
                using var ready = fence >= 0 ? new FenceHandle(fence) : null;
                var dependency = ready is null ? Complete() : new ExternalImageSync { Kind = ExternalImageSyncKind.SyncFd,
                    Handle = ready, ImageLayout = 1, QueueFamily = 0xfffffffdu };
                scene.Source = source;
                scene.Rebuild();
                var callbacks = 0;
                Require(source.Publish(image, Frame(ExternalImageColorEncoding.Srgb), dependency, result =>
                {
                    Require(result.Status == ExternalFrameStatus.Released, "reader release " + result.Status);
                    if (result.ReleaseSync is { } sync)
                    {
                        DeleteImageAsync(nativeImage, (int)sync.DangerousGetHandle());
                        sync.SetHandleAsInvalid();
                        sync.Dispose();
                    }
                    else DeleteImage(nativeImage);
                    callbacks++;
                }) == ExternalImageStatus.Success, "ImageReader publication");
                using var capture = await Capture(view, source);
                VerifyPixel(capture, new[] { 64, 128, 192 });
                Require(callbacks == 0, "ImageReader recycled before replacement");
                image.Dispose();
                source.Dispose();
                await Until(() => callbacks == 1);
                global::Android.Util.Log.Info("GooAhbSmoke", "ImageReader recycle " + iteration + " acquireFd=" + fence);
            }
        }
        finally
        {
            EglMakeCurrent(display, 0, 0, 0);
            if (surface != 0) EglDestroySurface(display, surface);
            if (context != 0) EglDestroyContext(display, context);
            EglTerminate(display);
            DeleteReader(reader);
        }
    }

    private static ExternalFrameDescription Frame(ExternalImageColorEncoding encoding) => new()
    {
        Width = 8, Height = 8, Orientation = 1, AlphaMode = ExternalImageAlphaMode.Opaque, ColorEncoding = encoding
    };

    private static ExternalImageSync Complete() => new()
    {
        Kind = ExternalImageSyncKind.AlreadyComplete, ImageLayout = 1, QueueFamily = 0xfffffffdu
    };

    private static async Task<Bitmap> Capture(GooView view, ExternalImageSource source)
    {
        await Until(() =>
        {
            using var lease = source.Acquire();
            return !lease.IsFailed;
        });
        await Task.Delay(50);
        await Until(() => !view.HasFrameDemand);
        var bitmap = Bitmap.CreateBitmap(view.Width, view.Height, Bitmap.Config.Argb8888!)!;
        var completion = new TaskCompletionSource<int>();
        using var listener = new CopyListener(completion);
        using var handler = new Handler(Looper.MainLooper!);
        PixelCopy.Request(view, bitmap, listener, handler);
        Require(await completion.Task == (int)PixelCopyResult.Success, "surface capture");
        return bitmap;
    }

    private sealed class CopyListener(TaskCompletionSource<int> completion) : Java.Lang.Object, PixelCopy.IOnPixelCopyFinishedListener
    {
        public void OnPixelCopyFinished(int result) => completion.SetResult(result);
    }

    private static async Task Until(Func<bool> condition)
    {
        var deadline = Environment.TickCount64 + 15000;
        while (!condition())
        {
            Require(Environment.TickCount64 < deadline, "completion deadline");
            await Task.Delay(20);
        }
    }

    private static void VerifyPixel(Bitmap capture, int[] expected)
    {
        var pixel = new global::Android.Graphics.Color(capture.GetPixel(capture.Width / 2, capture.Height / 2));
        var actual = new[] { (int)pixel.R, pixel.G, pixel.B };
        for (var component = 0; component < 3; component++)
            Require(Math.Abs(actual[component] - expected[component]) <= 5,
                "pixel " + component + " got " + actual[component] + " expected " + expected[component]);
        Require(pixel.A == 255, "pixel alpha");
    }

    private static int[] Expected(ExternalImageColorEncoding encoding)
    {
        var limited = (int)encoding % 2 == 0;
        var y = limited ? (120.0 - 16) / 219 : 120.0 / 255;
        var cb = (100.0 - 128) / (limited ? 224 : 255);
        var cr = (145.0 - 128) / (limited ? 224 : 255);
        var bt709 = encoding is ExternalImageColorEncoding.AndroidBt709Limited or ExternalImageColorEncoding.AndroidBt709Full;
        var rgb = bt709 ? new[] { y + 1.5748 * cr, y - 0.187324 * cb - 0.468124 * cr, y + 1.8556 * cb }
            : new[] { y + 1.402 * cr, y - 0.344136 * cb - 0.714136 * cr, y + 1.772 * cb };
        for (var i = 0; i < 3; i++) rgb[i] = rgb[i] < 0.081 ? rgb[i] / 4.5 : Math.Pow((rgb[i] + 0.099) / 1.099, 1 / 0.45);
        if (encoding is ExternalImageColorEncoding.AndroidBt601_625Limited or ExternalImageColorEncoding.AndroidBt601_625Full)
            rgb = new[] { 1.044043 * rgb[0] - 0.044043 * rgb[1], rgb[1], 0.011793 * rgb[1] + 0.988207 * rgb[2] };
        if (encoding is ExternalImageColorEncoding.AndroidBt601_525Limited or ExternalImageColorEncoding.AndroidBt601_525Full)
            rgb = new[] { 0.939542 * rgb[0] + 0.050181 * rgb[1] + 0.010277 * rgb[2],
                0.017772 * rgb[0] + 0.965793 * rgb[1] + 0.016435 * rgb[2],
                -0.001622 * rgb[0] - 0.004371 * rgb[1] + 1.005993 * rgb[2] };
        return rgb.Select(value => (int)Math.Round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.Pow(value, 1 / 2.4) - 0.055))).ToArray();
    }

    private static void Fill(nint buffer, bool yuv)
    {
        Require(LockPlanes(buffer, 0x30, -1, 0, out var planes) == 0, "buffer lock");
        try
        {
            if (!yuv) FillRgba(planes.First.Data, planes.First.RowStride / 4, 64, 128, 192);
            else
            {
                Require(planes.Count == 3, "YCbCr planes");
                FillPlane(planes.First, 8, 8, 120);
                FillPlane(planes.Second, 4, 4, 100);
                FillPlane(planes.Third, 4, 4, 145);
            }
        }
        finally { Require(Unlock(buffer, 0) == 0, "buffer unlock"); }
    }

    private static void FillPlane(Plane plane, int width, int height, byte value)
    {
        for (var y = 0; y < height; y++)
            for (var x = 0; x < width; x++)
                Marshal.WriteByte(plane.Data, checked(y * (int)plane.RowStride + x * (int)plane.PixelStride), value);
    }

    private static void FillRgba(nint data, uint stride, byte red, byte green, byte blue)
    {
        for (var y = 0; y < 8; y++)
            for (var x = 0; x < 8; x++)
                Marshal.WriteInt32(data, checked((int)(y * stride + x) * 4), red | green << 8 | blue << 16 | unchecked((int)0xff000000));
    }

    private static void Require(bool condition, string detail)
    {
        if (!condition) throw new InvalidOperationException(detail);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BufferDescription
    {
        internal uint Width, Height, Layers, Format;
        internal ulong Usage;
        internal uint Stride, Reserved0;
        internal ulong Reserved1;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Plane { internal nint Data; internal uint PixelStride, RowStride; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Planes { internal uint Count; internal Plane First, Second, Third, Fourth; }

    private sealed class FenceHandle : SafeHandle
    {
        internal FenceHandle(int fd) : base((nint)(-1), true) { SetHandle(fd); }
        public override bool IsInvalid => handle == -1;
        protected override bool ReleaseHandle() => AndroidExternalImageSmoke.Close((int)handle) == 0;
    }

    [DllImport("libandroid.so", EntryPoint = "AHardwareBuffer_allocate")]
    private static extern int Allocate(ref BufferDescription description, out nint buffer);
    [DllImport("libandroid.so", EntryPoint = "AHardwareBuffer_release")]
    private static extern void Release(nint buffer);
    [DllImport("libandroid.so", EntryPoint = "AHardwareBuffer_lockPlanes")]
    private static extern int LockPlanes(nint buffer, ulong usage, int fence, nint rectangle, out Planes planes);
    [DllImport("libandroid.so", EntryPoint = "AHardwareBuffer_unlock")]
    private static extern int Unlock(nint buffer, nint fence);
    [DllImport("libmediandk.so", EntryPoint = "AImageReader_newWithUsage")]
    private static extern int NewReader(int width, int height, int format, ulong usage, int maxImages, out nint reader);
    [DllImport("libmediandk.so", EntryPoint = "AImageReader_getWindow")]
    private static extern int GetWindow(nint reader, out nint window);
    [DllImport("libmediandk.so", EntryPoint = "AImageReader_acquireLatestImageAsync")]
    private static extern int AcquireImage(nint reader, out nint image, out int fence);
    [DllImport("libmediandk.so", EntryPoint = "AImage_getHardwareBuffer")]
    private static extern int GetHardwareBuffer(nint image, out nint buffer);
    [DllImport("libmediandk.so", EntryPoint = "AImage_delete")]
    private static extern void DeleteImage(nint image);
    [DllImport("libmediandk.so", EntryPoint = "AImage_deleteAsync")]
    private static extern void DeleteImageAsync(nint image, int fence);
    [DllImport("libmediandk.so", EntryPoint = "AImageReader_delete")]
    private static extern void DeleteReader(nint reader);
    [DllImport("libEGL.so", EntryPoint = "eglGetDisplay")]
    private static extern nint EglGetDisplay(nint display);
    [DllImport("libEGL.so", EntryPoint = "eglInitialize")]
    private static extern int EglInitialize(nint display, out int major, out int minor);
    [DllImport("libEGL.so", EntryPoint = "eglChooseConfig")]
    private static extern int EglChooseConfig(nint display, int[] attributes, out nint config, int capacity, out int count);
    [DllImport("libEGL.so", EntryPoint = "eglCreateContext")]
    private static extern nint EglCreateContext(nint display, nint config, nint shared, int[] attributes);
    [DllImport("libEGL.so", EntryPoint = "eglCreateWindowSurface")]
    private static extern nint EglCreateWindowSurface(nint display, nint config, nint window, int[] attributes);
    [DllImport("libEGL.so", EntryPoint = "eglMakeCurrent")]
    private static extern int EglMakeCurrent(nint display, nint draw, nint read, nint context);
    [DllImport("libEGL.so", EntryPoint = "eglSwapBuffers")]
    private static extern int EglSwapBuffers(nint display, nint surface);
    [DllImport("libEGL.so", EntryPoint = "eglDestroySurface")]
    private static extern int EglDestroySurface(nint display, nint surface);
    [DllImport("libEGL.so", EntryPoint = "eglDestroyContext")]
    private static extern int EglDestroyContext(nint display, nint context);
    [DllImport("libEGL.so", EntryPoint = "eglTerminate")]
    private static extern int EglTerminate(nint display);
    [DllImport("libGLESv2.so", EntryPoint = "glClearColor")]
    private static extern void GlClearColor(float red, float green, float blue, float alpha);
    [DllImport("libGLESv2.so", EntryPoint = "glClear")]
    private static extern void GlClear(uint mask);
    [DllImport("libc", EntryPoint = "close")]
    private static extern int Close(int fd);
}
