using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Goo;
using Xunit;

public sealed class FileDialogTests
{
    [Fact]
    public void ChooserOptionsRejectAmbiguousOrUnboundedRequestsBeforeLaunch()
    {
        NativeFileDialog.Validate(FileDialogKind.OpenFile, new FileDialogOptions
        {
            Multiple = true,
            InitialPath = Path.GetTempPath(),
            Filters = new[] { new FileDialogFilter("Images", "png;jpg"), new FileDialogFilter("All files", "*") },
        });
        Assert.Throws<ArgumentOutOfRangeException>(() => NativeFileDialog.Validate((FileDialogKind)9, new()));
        Assert.Throws<ArgumentException>(() => NativeFileDialog.Validate(FileDialogKind.SaveFile, new() { Multiple = true }));
        Assert.Throws<ArgumentException>(() => NativeFileDialog.Validate(FileDialogKind.OpenFile, new() { InitialPath = "relative/file" }));
        Assert.Throws<ArgumentException>(() => NativeFileDialog.Validate(FileDialogKind.OpenFile, new() { Title = "nul\0title" }));
        Assert.Throws<ArgumentException>(() => NativeFileDialog.Validate(FileDialogKind.OpenFile, new() { Title = new string('x', 257) }));
        Assert.Throws<ArgumentException>(() => NativeFileDialog.Validate(FileDialogKind.Folder, new() { Filters = new[] { new FileDialogFilter("All", "*") } }));
        foreach (var pattern in new[] { "", "*.png", "png;;jpg", "png;jp/g", "png;*" })
            Assert.Throws<ArgumentException>(() => NativeFileDialog.Validate(FileDialogKind.OpenFile, new() { Filters = new[] { new FileDialogFilter("Images", pattern) } }));
        Assert.Throws<ArgumentException>(() => NativeFileDialog.Validate(FileDialogKind.OpenFile, new()
        {
            Filters = Enumerable.Repeat(new FileDialogFilter("All", "*"), 65).ToArray(),
        }));
    }

    [Fact]
    public void NativeResultOwnsPathsAfterNativeBuffersAreFreed()
    {
        var paths = new[] { Path.Combine(Path.GetTempPath(), "one two"), Path.Combine(Path.GetTempPath(), "café") };
        FileDialogResult result;
        using (var native = new NativePaths(paths))
            result = NativeFileDialog.ReadResult(native.Pointer, 1, 2);
        Assert.Equal(FileDialogStatus.Success, result.Status);
        Assert.Equal(paths, result.Paths);
        Assert.Equal(1, result.FilterIndex);
        Assert.Throws<NotSupportedException>(() => ((IList<string>)result.Paths)[0] = "changed");
    }

    [Fact]
    public void EmptyResultsCancelAndUnknownFilterIndexesRemainUnknown()
    {
        using var empty = new NativePaths([]);
        var cancelled = NativeFileDialog.ReadResult(empty.Pointer, 2, 3);
        Assert.Equal(FileDialogStatus.Cancelled, cancelled.Status);
        Assert.Empty(cancelled.Paths);
        using var selected = new NativePaths([Path.GetTempPath()]);
        Assert.Equal(-1, NativeFileDialog.ReadResult(selected.Pointer, 5, 1).FilterIndex);
        Assert.Equal(-1, NativeFileDialog.ReadResult(selected.Pointer, -1, 1).FilterIndex);
    }

    [Fact]
    public void NativeResultsRejectRelativePathsAndEnforceThePathCountBudget()
    {
        using var relative = new NativePaths(["relative"]);
        Assert.Throws<InvalidDataException>(() => NativeFileDialog.ReadResult(relative.Pointer, -1, 0));
        using var excessive = new NativePaths(Enumerable.Repeat(Path.GetTempPath(), 4097).ToArray());
        Assert.Throws<ClipboardLimitException>(() => NativeFileDialog.ReadResult(excessive.Pointer, -1, 0));
    }

    [Fact]
    public async System.Threading.Tasks.Task ClosedWindowsRejectRequestsAndHaveNoPendingDialogToCancel()
    {
        var window = new Window();
        await Assert.ThrowsAsync<InvalidOperationException>(() => window.ShowFileDialogAsync(FileDialogKind.OpenFile));
        Assert.False(window.CancelFileDialog());
    }

    private sealed class NativePaths : IDisposable
    {
        private readonly nint[] strings;
        public nint Pointer { get; }
        public NativePaths(string[] paths)
        {
            strings = paths.Select(Marshal.StringToCoTaskMemUTF8).ToArray();
            Pointer = Marshal.AllocHGlobal((strings.Length + 1) * nint.Size);
            for (var index = 0; index < strings.Length; index++)
                Marshal.WriteIntPtr(Pointer, index * nint.Size, strings[index]);
            Marshal.WriteIntPtr(Pointer, strings.Length * nint.Size, 0);
        }
        public void Dispose()
        {
            Marshal.FreeHGlobal(Pointer);
            foreach (var value in strings) Marshal.FreeCoTaskMem(value);
        }
    }
}
