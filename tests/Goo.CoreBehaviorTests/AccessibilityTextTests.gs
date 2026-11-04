import Goo
import GooAndroidSmoke
import System
import System.Collections.Generic
import System.Linq
import System.Reflection
import System.Runtime.InteropServices
import Xunit

class AccessibilityTextTests {
    @Fact
    func NativeRolesAndSparseGridReachAccessKit() {
        using let adapter = NativeAccessibilityAdapter()
        let window = Window{Width: 420, Height: 760, Root: SmokeApplication.CreateAccessibilityRoot()}
        window.AccessibilityAdapter = adapter
        try {
            window.UpdateTree()
            let update = nint(
                typeof(NativeAccessibilityAdapter).GetMethod("Encode", BindingFlags.Instance | BindingFlags.NonPublic)!!
                    .Invoke(adapter, []object? {true})!!
            )
            try {
                let text = TreeUpdateDebug(update)
                try {
                    let dump = Marshal.PtrToStringUTF8(text)!!
                    Console.WriteLine(dump)
                    for role in []string{"Splitter", "TabPanel", "Toolbar", "Tooltip", "Grid", "GridCell", "ColumnHeader", "RowHeader"} {
                        Assert.Contains(role, dump)
                    }
                    for property in []string{"row_index: 400", "column_index: 7", "row_count: 1000", "column_count: 20"} {
                        Assert.Contains(property, dump)
                    }
                } finally {
                    StringFree(text)
                }
            } finally {
                AccessKitNative.TreeUpdateFree(update)
            }
        } finally {
            window.Close()
        }
    }
    @Fact
    func NativeTextGeometrySurvivesWrappingBidiAndResize() {
        const content = "Hello שלום world again and again"
        using let adapter = NativeAccessibilityAdapter()
        let window = Window{Width: 180, Height: 400, Root: TextCell(content)}
        window.AccessibilityAdapter = adapter
        try {
            window.UpdateTree()
            let initial = Encode(adapter)
            Assert.Equal(content, string.Concat(initial.Select((run NativeAccessibilityTextRun) -> run.Text)))
            Assert.All(initial, (run NativeAccessibilityTextRun) -> Assert.True(run.Geometry, run.Text))
            Assert.Contains(initial, (run NativeAccessibilityTextRun) -> run.Direction == uint8(1))
            let initialLines = initial.Select((run NativeAccessibilityTextRun) -> run.Bounds.Y).Distinct().Count()
            Assert.True(initialLines > 1)
            window.Width = 110
            window.UpdateTree()
            let resized = Encode(adapter)
            Assert.Equal(content, string.Concat(resized.Select((run NativeAccessibilityTextRun) -> run.Text)))
            Assert.All(resized, (run NativeAccessibilityTextRun) -> Assert.True(run.Geometry, run.Text))
            Assert.True(
                resized.Select((run NativeAccessibilityTextRun) -> run.Bounds.Y).Distinct().Count() > initialLines
            )
        } finally {
            window.Close()
        }
    }

    private class TextCell(content string) : Cell {
        override func Build() Blob -> Text{Content: content, FontSize: 20, TextWrap: TextWrap.Wrap}
    }

    shared {
        @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_update_debug", CallingConvention: CallingConvention.Cdecl)
        private func TreeUpdateDebug(update nint) nint;
        @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_string_free", CallingConvention: CallingConvention.Cdecl)
        private func StringFree(value nint);
        private func Encode(adapter NativeAccessibilityAdapter)[]NativeAccessibilityTextRun {
            let type = typeof(NativeAccessibilityAdapter)
            let update = nint(
                type.GetMethod("Encode", BindingFlags.Instance | BindingFlags.NonPublic)!!.Invoke(
                    adapter,
                    []object? {true}
                )!!
            )
            AccessKitNative.TreeUpdateFree(update)
            let cache = cast[Dictionary[int64, NativeAccessibilityNodeCache]](
                type.GetField("cache", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(adapter)!!
            )
            return cache.Values.SelectMany((node NativeAccessibilityNodeCache) -> node.Runs).ToArray()
        }
    }
}
