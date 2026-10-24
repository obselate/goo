import Goo
import Goo.SpellCheck
import System
import System.Diagnostics
import System.IO
import System.Linq
import System.Reflection
import System.Threading
import System.Threading.Tasks
import Xunit

class SpellingTests {
    @Fact
    func NativeDictionaryMarksSuggestsCorrectsAndUndoesWithUtf16Offsets() Task -> Task.Run(RunNativeDictionaryEditor)

    @Fact
    async func MissingDictionaryAndCancellationAreExplicitResults() {
        let document = TextDocument("hello")
        using let service = HunspellSpellingService("en-US", "/missing/goo.aff", "/missing/goo.dic")
        using let cancelled = CancellationTokenSource()
        cancelled.Cancel()
        Assert.Equal(
            SpellingStatus.Cancelled,
            (await service.CheckAsync(document.Snapshot(), TextRange(0, 5), "en-US", cancelled.Token)).Status
        )
        Assert.Contains(
            (await service.CheckAsync(document.Snapshot(), TextRange(0, 5), "en-US")).Status,
            []SpellingStatus{SpellingStatus.LanguageUnavailable, SpellingStatus.Unsupported}
        )
    }

    shared {
        private func RunNativeDictionaryEditor() {
            if !OperatingSystem.IsLinux() {
                return
            }
            let directory = Path.Combine(Path.GetTempPath(), "goo-spelling-" + Guid.NewGuid().ToString("N"))
            Directory.CreateDirectory(directory)
            try {
                let aff = Path.Combine(directory, "sample.aff")
                let dictionary = Path.Combine(directory, "sample.dic")
                File.WriteAllText(aff, `SET UTF-8
WORDCHARS '
`)
                File.WriteAllText(dictionary, `3
hello
can't
naïve
`)
                using let service = HunspellSpellingService("en-US", aff, dictionary)
                let document = TextDocument("🙂 helo can't naïve")
                using let controller = TextEditorController(document)
                let range_ = TextRange(3, document.Length - 3)
                let checkedText = service.CheckAsync(document.Snapshot(), range_, "en-US").GetAwaiter().GetResult()
                if checkedText.Status == SpellingStatus.Unsupported && Environment.GetEnvironmentVariable(
                    "GOO_REQUIRE_HUNSPELL"
                ) != "1" {
                    return
                }
                Assert.Equal(SpellingStatus.Success, checkedText.Status)
                let error = Assert.Single(checkedText.Errors)
                Assert.Equal(TextRange(3, 4), error.Range)
                Assert.Equal("helo", error.Word)
                let owner = Window()
                using let session = SpellCheckSession(owner, controller, service, "en-US")
                let task = session.CheckAsync(range_)
                let drain = typeof(Window).GetMethod(
                    "drainPostedActions",
                    BindingFlags.Instance | BindingFlags.NonPublic
                )!!
                let deadline = Stopwatch.StartNew()
                while !task.IsCompleted && deadline.Elapsed < TimeSpan.FromSeconds(10) {
                    drain.Invoke(owner, nil)
                    Thread.Yield()
                }
                Assert.True(task.IsCompleted, "The native spelling check did not complete.")
                Assert.Equal(SpellingStatus.Success, task.GetAwaiter().GetResult().Status)
                Assert.True(session.Layer.Revision > int64(0))
                let suggestions = session
                    .SuggestAsync(TextPosition(4, TextAffinity.Downstream))
                    .GetAwaiter()
                    .GetResult()
                Assert.Equal(SpellingStatus.Success, suggestions.Status)
                let index = suggestions.Values.ToList().IndexOf("hello")
                Assert.True(index >= 0)
                session.ReadOnly = true
                Assert.Equal(SpellingStatus.Disabled, session.ApplySuggestion(suggestions, index))
                session.ReadOnly = false
                Assert.Equal(SpellingStatus.Success, session.ApplySuggestion(suggestions, index))
                Assert.Equal("🙂 hello can't naïve", document.GetText())
                Assert.True(controller.Execute(TextCommand(TextCommandKind.Undo, "", false)))
                Assert.Equal("🙂 helo can't naïve", document.GetText())
                Assert.Equal(SpellingStatus.Stale, session.ApplySuggestion(suggestions, index))
                Assert.Equal(
                    SpellingStatus.LanguageUnavailable,
                    service.CheckAsync(document.Snapshot(), range_, "fr-FR").GetAwaiter().GetResult().Status
                )
                var refreshed SpellingResult? = nil
                session.Updated += (result SpellingResult) -> {
                    if result.Version == document.Version && result.Status == SpellingStatus.Success {
                        refreshed = result
                    }
                }
                controller.Selection = TextSelection(
                    TextPosition(0, TextAffinity.Downstream),
                    TextPosition(document.Length, TextAffinity.Upstream)
                )
                Assert.True(controller.Execute(TextCommand(TextCommandKind.Insert, "hello\nhello", false)))
                controller.Selection = TextSelection(
                    TextPosition(4, TextAffinity.Downstream),
                    TextPosition(5, TextAffinity.Upstream)
                )
                Assert.True(controller.Execute(TextCommand(TextCommandKind.DeleteForward, "", false)))
                controller.Selection = TextSelection(
                    TextPosition(9, TextAffinity.Downstream),
                    TextPosition(10, TextAffinity.Upstream)
                )
                Assert.True(controller.Execute(TextCommand(TextCommandKind.DeleteForward, "", false)))
                deadline.Restart()
                while refreshed == nil && deadline.Elapsed < TimeSpan.FromSeconds(10) {
                    drain.Invoke(owner, nil)
                    Thread.Yield()
                }
                Assert.NotNull(refreshed)
                Assert.Equal("hell\nhell", document.GetText())
                Assert.Equal(2, refreshed!!.Errors.Count)
                let closing = session.CheckAsync(TextRange(0, document.Length))
                typeof(Window).GetMethod("Close", BindingFlags.Instance | BindingFlags.NonPublic)!!.Invoke(owner, nil)
                Assert.Equal(
                    SpellingStatus.Cancelled,
                    closing.WaitAsync(TimeSpan.FromSeconds(10)).GetAwaiter().GetResult().Status
                )
            } finally {
                Directory.Delete(directory, true)
            }
        }
    }
}
