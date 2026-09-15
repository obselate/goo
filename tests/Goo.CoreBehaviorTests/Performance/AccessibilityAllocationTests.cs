using System;
using System.Text;
using Goo;
using Xunit;

[Trait("Category", "Performance")]
public sealed class AccessibilityAllocationTests
{
    private const int TextBatchOperations = 64;
    private const long AccessibilityDirtyAllocationBudget = 2_048;
    private const long TextEntryAllocationBudget = 4_096;

    [Fact]
    public void OptOutStableUpdateTreeStaysAllocationFree()
    {
        var fixtures = new AccessibilityPerformanceFixtures();
        fixtures.PrepareOptOut();
        for (var index = 0; index < 8; index++)
            Assert.Equal(2, fixtures.StepOptOut());

        var bytes = Measure(fixtures.StepOptOut, out var count);

        Assert.Equal(2, count);
        Assert.True(fixtures.OptOutHasNoDemand());
        Assert.Equal(0, bytes);
    }

    [Fact]
    public void OptOutMountAndDisposeStaysWithinItsDirectBaseline()
    {
        var fixtures = new AccessibilityPerformanceFixtures();
        for (var index = 0; index < 4; index++)
            Assert.Equal(2, fixtures.MountAndDisposeOptOut());

        var bytes = Measure(fixtures.MountAndDisposeOptOut, out var count);

        Assert.Equal(2, count);
        Assert.InRange(bytes, 0, 50_000);
    }

    [Fact]
    public void OptInCleanSemanticUpdateTreeStaysAllocationFree()
    {
        var fixtures = new AccessibilityPerformanceFixtures();
        fixtures.PrepareOptIn();
        for (var index = 0; index < 8; index++)
            Assert.Equal(1, fixtures.StepOptIn());

        var bytes = Measure(fixtures.StepOptIn, out var updates);

        Assert.Equal(1, updates);
        Assert.Equal(0, bytes);
    }

    [Fact]
    public void EquivalentSemanticRebuildStaysLean()
    {
        var fixtures = new AccessibilityPerformanceFixtures();
        fixtures.PrepareOptIn();
        for (var index = 0; index < 8; index++)
            Assert.Equal(1, fixtures.ForceEquivalentSemanticRebuild());

        var bytes = Measure(fixtures.ForceEquivalentSemanticRebuild, out var updates);

        Assert.Equal(1, updates);
        Assert.InRange(bytes, 0, 2_048);
    }

    [Fact]
    public void OneMiBEditorEditAndSemanticPublishAvoidsDocumentCopies()
    {
        using var editor = new AccessibleEditorAllocationCase();
        for (var index = 0; index < 8; index++)
            Assert.True(editor.EditAndPublish() > 0);

        var bytes = Measure(editor.EditAndPublish, out var version);

        Assert.True(version > 0);
        Assert.InRange(bytes, 0, 110_000);
    }

    [Fact]
    public void ActiveAdapterScaleKeepsNoOpFramesFullyQuiet()
    {
        var fixtures = new AccessibilityScaleFixtures();
        Assert.Equal(1_001, fixtures.Prepare());

        AssertNoOp(fixtures, fixtures.StepUnchanged);
        AssertNoOp(fixtures, fixtures.StepNoOpWheel);
    }

    [Fact]
    public void ActiveAdapterScaleSeparatesSemanticRebuildAndAdapterDelivery()
    {
        var fixtures = new AccessibilityScaleFixtures();
        Assert.Equal(1_001, fixtures.Prepare());

        AssertRebuildOnly(fixtures);
        AssertAdapterDeliveryOnly(fixtures);
    }

    [Fact]
    public void ActiveAdapterScaleDirtyRowsStayWithinBudget()
    {
        AssertDirtyRow(fixtures => fixtures.StepHoverBoundary(), false);
        AssertDirtyRow(fixtures => fixtures.StepFocusChange(), true);
        AssertDirtyRow(fixtures => fixtures.StepScroll(), true);
        AssertDirtyRow(fixtures => fixtures.StepSemanticDeclarationChange(), true);
    }

    [Fact]
    public void ActiveAdapterScaleTextEditStaysWithinPairedBudget()
    {
        var intrinsic = new AccessibilityScaleFixtures();
        Assert.Equal(1_001, intrinsic.PrepareWithoutAdapter());
        Warm(intrinsic.StepTextEditWithoutAdapter);
        var intrinsicBytes = MeasureBatch(intrinsic.StepTextEditWithoutAdapter, TextBatchOperations);

        var active = new AccessibilityScaleFixtures();
        Assert.Equal(1_001, active.Prepare());
        Warm(active.StepTextEdit);
        var updates = active.AdapterUpdates();
        var version = active.TreeVersion();
        var activeBytes = MeasureBatch(active.StepTextEdit, TextBatchOperations);

        Assert.False(intrinsic.SemanticDemandBeforePublish());
        Assert.False(intrinsic.HasSemanticDemand());
        Assert.True(active.SemanticDemandBeforePublish());
        Assert.False(active.HasSemanticDemand());
        Assert.Equal(updates + TextBatchOperations, active.AdapterUpdates());
        Assert.Equal(version + TextBatchOperations, active.TreeVersion());
        Assert.InRange(intrinsicBytes, 0, TextBatchOperations * TextEntryAllocationBudget);
        Assert.InRange(activeBytes, 0,
            TextBatchOperations * (TextEntryAllocationBudget + AccessibilityDirtyAllocationBudget));
        Assert.InRange(activeBytes - intrinsicBytes, 0,
            TextBatchOperations * AccessibilityDirtyAllocationBudget);
    }

    private static void AssertNoOp(AccessibilityScaleFixtures fixtures, Func<bool> operation)
    {
        for (var index = 0; index < 8; index++)
        {
            var updates = fixtures.AdapterUpdates();
            var version = fixtures.TreeVersion();
            Assert.True(operation());
            Assert.False(fixtures.SemanticDemandBeforePublish());
            Assert.False(fixtures.HasSemanticDemand());
            Assert.False(fixtures.RenderPending());
            Assert.Equal(updates, fixtures.AdapterUpdates());
            Assert.Equal(version, fixtures.TreeVersion());
        }

        var baselineUpdates = fixtures.AdapterUpdates();
        var baselineVersion = fixtures.TreeVersion();
        var bytes = Measure(operation, out var result);

        Assert.True(result);
        Assert.False(fixtures.SemanticDemandBeforePublish());
        Assert.False(fixtures.HasSemanticDemand());
        Assert.False(fixtures.RenderPending());
        Assert.Equal(baselineUpdates, fixtures.AdapterUpdates());
        Assert.Equal(baselineVersion, fixtures.TreeVersion());
        Assert.Equal(0, bytes);
    }

    private static void AssertRebuildOnly(AccessibilityScaleFixtures fixtures)
    {
        for (var index = 0; index < 8; index++)
        {
            Assert.True(fixtures.StepEquivalentSemanticRebuild());
            Assert.True(fixtures.SemanticDemandBeforePublish());
            Assert.False(fixtures.HasSemanticDemand());
        }

        var bytes = Measure(fixtures.StepEquivalentSemanticRebuild, out var result);

        Assert.True(result);
        Assert.True(fixtures.SemanticDemandBeforePublish());
        Assert.False(fixtures.HasSemanticDemand());
        Assert.InRange(bytes, 0, AccessibilityDirtyAllocationBudget);
    }

    private static void AssertAdapterDeliveryOnly(AccessibilityScaleFixtures fixtures)
    {
        for (var index = 0; index < 8; index++)
        {
            Assert.True(fixtures.StepAdapterDeliveryOnly());
            Assert.False(fixtures.SemanticDemandBeforePublish());
            Assert.False(fixtures.HasSemanticDemand());
        }

        var bytes = Measure(fixtures.StepAdapterDeliveryOnly, out var result);

        Assert.True(result);
        Assert.False(fixtures.SemanticDemandBeforePublish());
        Assert.False(fixtures.HasSemanticDemand());
        Assert.InRange(bytes, 0, AccessibilityDirtyAllocationBudget);
    }

    private static void AssertDirtyRow(Func<AccessibilityScaleFixtures, bool> operation,
        bool deliversSemanticChange)
    {
        var fixtures = new AccessibilityScaleFixtures();
        Assert.Equal(1_001, fixtures.Prepare());
        for (var index = 0; index < 8; index++)
            Assert.True(operation(fixtures));

        var updates = fixtures.AdapterUpdates();
        var version = fixtures.TreeVersion();
        var bytes = Measure(() => operation(fixtures), out var result);

        Assert.True(result);
        Assert.True(fixtures.SemanticDemandBeforePublish());
        Assert.False(fixtures.HasSemanticDemand());
        Assert.False(fixtures.RenderPending());
        Assert.InRange(bytes, 0, AccessibilityDirtyAllocationBudget);
        if (deliversSemanticChange)
        {
            Assert.Equal(updates + 1, fixtures.AdapterUpdates());
            Assert.Equal(version + 1, fixtures.TreeVersion());
        }
        else
        {
            Assert.Equal(updates, fixtures.AdapterUpdates());
            Assert.Equal(version, fixtures.TreeVersion());
        }
    }

    private static long Measure(Func<int> operation, out int result)
    {
        var before = GC.GetAllocatedBytesForCurrentThread();
        result = operation();
        return GC.GetAllocatedBytesForCurrentThread() - before;
    }

    private static long Measure(Func<long> operation, out long result)
    {
        var before = GC.GetAllocatedBytesForCurrentThread();
        result = operation();
        return GC.GetAllocatedBytesForCurrentThread() - before;
    }

    private static long Measure(Func<bool> operation, out bool result)
    {
        var before = GC.GetAllocatedBytesForCurrentThread();
        result = operation();
        return GC.GetAllocatedBytesForCurrentThread() - before;
    }

    private static void Warm(Func<bool> operation)
    {
        for (var index = 0; index < 16; index++)
        {
            Assert.True(operation());
        }
    }

    private static long MeasureBatch(Func<bool> operation, int operations)
    {
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
        var before = GC.GetAllocatedBytesForCurrentThread();
        var completed = true;
        for (var index = 0; index < operations; index++)
        {
            completed &= operation();
        }
        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert.True(completed);
        return allocated;
    }

    private sealed class AccessibleEditorAllocationCase : IDisposable
    {
        private readonly TextDocument document;
        private readonly TextEditorController controller;
        private readonly Window window;
        private bool insert = true;

        internal AccessibleEditorAllocationCase()
        {
            document = new TextDocument(LargeSource());
            controller = new TextEditorController(document)
            {
                Selection = CollapsedSelection(32),
            };
            var editor = new TextEditor(controller)
            {
                Width = Length.Percent(100),
                Height = Length.Percent(100),
            };
            window = new Window
            {
                Width = 800,
                Height = 520,
                Root = new AccessibleEditorRootCell(editor),
                AccessibilityAdapter = new Adapter(),
            };
            window.UpdateTree();
            window.UpdateTree(0);
        }

        internal long EditAndPublish()
        {
            var accepted = insert
                ? controller.Execute(new TextCommand(TextCommandKind.Insert, "x", false))
                : controller.Execute(new TextCommand(TextCommandKind.DeleteBackward, "", false));
            insert = !insert;
            if (!accepted)
                throw new InvalidOperationException("editor allocation edit was rejected");
            window.UpdateTree(0);
            return document.Version;
        }

        public void Dispose()
        {
            if (window.Tree is not null)
                NodeLifecycle.DisposeTree(window.Tree);
            controller.Dispose();
        }

        private static TextSelection CollapsedSelection(int offset) => new(
            new TextPosition(offset, TextAffinity.Downstream),
            new TextPosition(offset, TextAffinity.Downstream));

        private static string LargeSource()
        {
            const int size = 1024 * 1024;
            const string line = "The quick brown fox jumps over the lazy dog. Goo accessibility allocation gate 0123456789.\n";
            var result = new StringBuilder(size + line.Length);
            while (result.Length < size)
                result.Append(line);
            result.Length = size;
            return result.ToString();
        }
    }

    private sealed class AccessibleEditorRootCell(TextEditor editor) : Cell
    {
        public override Blob Build() => editor;
    }

    private sealed class Adapter : AccessibilityAdapter
    {
        public void Update(AccessibilityTree tree)
        {
        }
    }
}
