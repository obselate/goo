using System.Diagnostics;
using System.Reflection;
using Goo;
using Goo.SpellCheck;
using Xunit;

public sealed class SpellingTests
{
    [Fact]
    public Task NativeDictionaryMarksSuggestsCorrectsAndUndoesWithUtf16Offsets() =>
        Task.Run(RunNativeDictionaryEditor);

    private static void RunNativeDictionaryEditor()
    {
        if (!OperatingSystem.IsLinux())
            return;
        var directory = Path.Combine(Path.GetTempPath(), "goo-spelling-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var aff = Path.Combine(directory, "sample.aff");
            var dictionary = Path.Combine(directory, "sample.dic");
            File.WriteAllText(aff, "SET UTF-8\nWORDCHARS '\n");
            File.WriteAllText(dictionary, "3\nhello\ncan't\nnaïve\n");
            using var service = new HunspellSpellingService("en-US", aff, dictionary);
            var document = new TextDocument("🙂 helo can't naïve");
            using var controller = new TextEditorController(document);
            var range = new TextRange(3, document.Length - 3);
            var checkedText = service.CheckAsync(document.Snapshot(), range, "en-US").GetAwaiter().GetResult();
            if (checkedText.Status == SpellingStatus.Unsupported &&
                Environment.GetEnvironmentVariable("GOO_REQUIRE_HUNSPELL") != "1")
                return;
            Assert.Equal(SpellingStatus.Success, checkedText.Status);
            var error = Assert.Single(checkedText.Errors);
            Assert.Equal(new TextRange(3, 4), error.Range);
            Assert.Equal("helo", error.Word);
            var owner = new Window();
            using var session = new SpellCheckSession(owner, controller, service, "en-US");
            var task = session.CheckAsync(range);
            var drain = typeof(Window).GetMethod("drainPostedActions", BindingFlags.Instance | BindingFlags.NonPublic)!;
            var deadline = Stopwatch.StartNew();
            while (!task.IsCompleted && deadline.Elapsed < TimeSpan.FromSeconds(10))
            {
                drain.Invoke(owner, null);
                Thread.Yield();
            }
            Assert.True(task.IsCompleted, "The native spelling check did not complete.");
            Assert.Equal(SpellingStatus.Success, task.GetAwaiter().GetResult().Status);
            Assert.True(session.Layer.Revision > 0);
            var suggestions = session.SuggestAsync(new TextPosition(4, TextAffinity.Downstream)).GetAwaiter().GetResult();
            Assert.Equal(SpellingStatus.Success, suggestions.Status);
            var index = suggestions.Values.ToList().IndexOf("hello");
            Assert.True(index >= 0);
            session.ReadOnly = true;
            Assert.Equal(SpellingStatus.Disabled, session.ApplySuggestion(suggestions, index));
            session.ReadOnly = false;
            Assert.Equal(SpellingStatus.Success, session.ApplySuggestion(suggestions, index));
            Assert.Equal("🙂 hello can't naïve", document.GetText());
            Assert.True(controller.Execute(new TextCommand(TextCommandKind.Undo, "", false)));
            Assert.Equal("🙂 helo can't naïve", document.GetText());
            Assert.Equal(SpellingStatus.Stale, session.ApplySuggestion(suggestions, index));
            Assert.Equal(SpellingStatus.LanguageUnavailable,
                service.CheckAsync(document.Snapshot(), range, "fr-FR").GetAwaiter().GetResult().Status);
            SpellingResult? refreshed = null;
            session.Updated += result =>
            {
                if (result.Version == document.Version && result.Status == SpellingStatus.Success)
                    refreshed = result;
            };
            controller.Selection = new TextSelection(new TextPosition(0, TextAffinity.Downstream),
                new TextPosition(document.Length, TextAffinity.Upstream));
            Assert.True(controller.Execute(new TextCommand(TextCommandKind.Insert, "hello\nhello", false)));
            controller.Selection = new TextSelection(new TextPosition(4, TextAffinity.Downstream),
                new TextPosition(5, TextAffinity.Upstream));
            Assert.True(controller.Execute(new TextCommand(TextCommandKind.DeleteForward, "", false)));
            controller.Selection = new TextSelection(new TextPosition(9, TextAffinity.Downstream),
                new TextPosition(10, TextAffinity.Upstream));
            Assert.True(controller.Execute(new TextCommand(TextCommandKind.DeleteForward, "", false)));
            deadline.Restart();
            while (refreshed == null && deadline.Elapsed < TimeSpan.FromSeconds(10))
            {
                drain.Invoke(owner, null);
                Thread.Yield();
            }
            Assert.NotNull(refreshed);
            Assert.Equal("hell\nhell", document.GetText());
            Assert.Equal(2, refreshed.Errors.Count);
            var closing = session.CheckAsync(new TextRange(0, document.Length));
            typeof(Window).GetMethod("Close", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(owner, null);
            Assert.Equal(SpellingStatus.Cancelled,
                closing.WaitAsync(TimeSpan.FromSeconds(10)).GetAwaiter().GetResult().Status);
        }
        finally { Directory.Delete(directory, true); }
    }

    [Fact]
    public async Task MissingDictionaryAndCancellationAreExplicitResults()
    {
        var document = new TextDocument("hello");
        using var service = new HunspellSpellingService("en-US", "/missing/goo.aff", "/missing/goo.dic");
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        Assert.Equal(SpellingStatus.Cancelled,
            (await service.CheckAsync(document.Snapshot(), new TextRange(0, 5), "en-US", cancelled.Token)).Status);
        Assert.Contains((await service.CheckAsync(document.Snapshot(), new TextRange(0, 5), "en-US")).Status,
            new[] { SpellingStatus.LanguageUnavailable, SpellingStatus.Unsupported });
    }
}
