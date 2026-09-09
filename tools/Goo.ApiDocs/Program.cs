using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

var repositoryRoot = FindRepositoryRoot(Environment.CurrentDirectory);
var arguments = ParseArguments(args);
var xmlPath = Resolve(arguments.GetValueOrDefault("xml"),
    Path.Combine(repositoryRoot, "Goo", "bin", "Release", "net10.0", "Goo.xml"));
var sourceRoot = Resolve(arguments.GetValueOrDefault("source"), Path.Combine(repositoryRoot, "Goo"));
var outputRoot = Resolve(arguments.GetValueOrDefault("output"), Path.Combine(repositoryRoot, "docs", "api"));

if (!File.Exists(xmlPath))
    throw new FileNotFoundException("Build Goo in Release mode before generating API pages.", xmlPath);

var sourceDirectories = Directory.EnumerateDirectories(sourceRoot)
    .Where(path => Path.GetFileName(path) is not ("bin" or "obj"))
    .OrderBy(Path.GetFileName, StringComparer.Ordinal)
    .ToArray();
var types = sourceDirectories
    .SelectMany(path => ReadTypes(path, sourceRoot))
    .GroupBy(type => type.XmlName, StringComparer.Ordinal)
    .Select(group => group.First() with
    {
        Sources = group.SelectMany(type => type.Sources)
            .OrderBy(source => source.RelativeFile, StringComparer.Ordinal)
            .ToArray(),
    })
    .OrderBy(type => type.Directory, StringComparer.Ordinal)
    .ThenBy(type => type.DisplayName, StringComparer.Ordinal)
    .ToArray();
var members = XDocument.Load(xmlPath)
    .Descendants("member")
    .Select(element => new ApiMember(
        element.Attribute("name")?.Value ?? throw new InvalidDataException("XML member has no name."),
        element))
    .ToArray();

var matched = new HashSet<string>(StringComparer.Ordinal);
Directory.CreateDirectory(outputRoot);
var expectedPages = sourceDirectories
    .Select(directory => Path.GetFileName(directory).ToLowerInvariant() + ".md")
    .Append("README.md")
    .ToHashSet(StringComparer.Ordinal);
foreach (var stalePath in Directory.EnumerateFiles(outputRoot, "*.md"))
{
    if (expectedPages.Contains(Path.GetFileName(stalePath)))
        continue;
    File.Delete(stalePath);
    Console.WriteLine($"Removed stale API page {stalePath}.");
}
foreach (var directoryPath in sourceDirectories)
{
    var directory = Path.GetFileName(directoryPath);
    var pageTypes = types.Where(type => type.Directory == directory).ToArray();
    var markdown = BuildPage(directory, pageTypes, members, matched);
    WriteIfChanged(Path.Combine(outputRoot, directory.ToLowerInvariant() + ".md"), markdown);
}

var unmatched = members.Select(member => member.Id)
    .Where(id => !matched.Contains(id))
    .Order(StringComparer.Ordinal)
    .ToArray();
if (unmatched.Length != 0)
    throw new InvalidDataException("Unmapped Goo.xml members:" + Environment.NewLine + string.Join(Environment.NewLine, unmatched));

WriteIfChanged(Path.Combine(outputRoot, "README.md"), BuildIndex(sourceDirectories));
Console.WriteLine($"Generated {sourceDirectories.Length} API pages in {outputRoot}.");

static void AppendGradientStopsGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Gradient stops");
    text.AppendLine();
    text.AppendLine("Linear and radial gradients accept two or more ordered stops, including repeated");
    text.AppendLine("positions for hard color edges. There is no fixed four-stop limit. Larger stop");
    text.AppendLine("lists use Goo-owned GPU storage and remain a single gradient draw; device storage");
    text.AppendLine("limits still apply. Interpolation uses premultiplied linear color, including");
    text.AppendLine("per-stop alpha and element opacity.");
}

static string BuildPage(string directory, ApiType[] types, ApiMember[] members, HashSet<string> matched)
{
    var text = new StringBuilder();
    text.AppendLine($"# {directory} API");
    text.AppendLine();
    text.AppendLine("Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.");
    text.AppendLine();
    text.AppendLine($"Source: [`Goo/{directory}`](../../Goo/{directory})");

    if (directory == "Accessibility")
        AppendAccessibilityGuide(text);
    if (directory == "Window")
        AppendWindowMetricsGuide(text);
    if (directory == "Window")
        AppendWindowNotificationGuide(text);
    if (directory == "Window")
        AppendWindowDispatcherGuide(text);
    if (directory == "Window")
        AppendClipboardGuide(text);
    if (directory == "Input")
        AppendKeyboardFocusGuide(text);
    if (directory == "Input")
        AppendTextInputGuide(text);
    if (directory == "Input")
        AppendPointerLifecycleGuide(text);
    if (directory == "Input")
        AppendDragDropGuide(text);
    if (directory == "Style")
        AppendStyleCompositionGuide(text);
    if (directory == "Cell")
        AppendCellInputGuide(text);
    if (directory == "Cell")
        AppendCellFactoryGuide(text);
    if (directory == "Tree")
        AppendVirtualizationGuide(text);
    if (directory == "Tree")
        AppendLayoutTransitionGuide(text);
    if (directory == "Tree")
        AppendOwnedImageSourceGuide(text);
    if (directory == "Tree")
        AppendElementMetricsGuide(text);
    if (directory == "Tree")
        AppendScrollGuide(text);
    if (directory == "Tree")
        AppendTextInputAreaGuide(text);
    if (directory == "Rendering")
        AppendShaderEffectGuide(text);
    if (directory == "Rendering")
        AppendGradientStopsGuide(text);

    if (types.Length == 0)
    {
        text.AppendLine();
        text.AppendLine("This source directory declares no public types.");
        return text.ToString();
    }

    foreach (var type in types)
    {
        text.AppendLine();
        text.AppendLine($"## `{type.DisplayName}`");
        text.AppendLine();
        text.AppendLine(type.Sources.Count == 1 ? "Source:" : "Sources:");
        text.AppendLine();
        foreach (var source in type.Sources)
            text.AppendLine($"- [`{source.FileName}`](../../Goo/{type.Directory}/{source.RelativeFile})");

        var typeId = "T:" + type.XmlName;
        var typeMember = members.SingleOrDefault(member => member.Id == typeId);
        if (typeMember is not null)
        {
            matched.Add(typeId);
            AppendText(text, Summary(typeMember.Element));
        }
        else
        {
            AppendText(text, type.Summary);
        }

        if (type.EnumValues.Count != 0)
        {
            text.AppendLine();
            text.AppendLine("### Values");
            text.AppendLine();
            foreach (var value in type.EnumValues)
                text.AppendLine($"- `{value}`");
        }

        if (type.XmlName == "Goo.ImageSourceProvider"
            && !members.Any(member => BelongsTo(member.Id, type.XmlName)))
            AppendImageSourceProviderMembers(text);

        foreach (var member in members
            .Where(member => BelongsTo(member.Id, type.XmlName))
            .OrderBy(member => member.Id, StringComparer.Ordinal))
        {
            matched.Add(member.Id);
            text.AppendLine();
            text.AppendLine($"### `{DisplayMember(member, type)}`");
            AppendText(text, Summary(member.Element));

            var parameters = member.Element.Elements("typeparam")
                .Concat(member.Element.Elements("param"))
                .ToArray();
            if (parameters.Length != 0)
            {
                text.AppendLine();
                foreach (var parameter in parameters)
                    text.AppendLine($"- `{parameter.Attribute("name")?.Value}`: {Normalize(parameter.Value)}");
            }

            var returns = Normalize(member.Element.Element("returns")?.Value);
            if (returns.Length != 0)
            {
                text.AppendLine();
                text.AppendLine($"Returns: {returns}");
            }
        }
    }

    return text.ToString();
}

static void AppendCellInputGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Build input cells");
    text.AppendLine();
    text.AppendLine("Store local Cell state in ordinary fields. Goo rebuilds the owning Cell after its input callbacks. Call `Rebuild()` after mutations outside Goo input dispatch.");
    text.AppendLine();
    text.AppendLine("A packaged G# component derived from `Cell<TInput>` should be an `open class` and override `protected Build(input TInput) Blob`. G# requires the inheritable class declaration because the override is protected. Goo passes the stored immutable snapshot through this typed dispatch path. Existing same-assembly components that override parameterless `Build()` remain valid. If a component overrides both overloads, the typed overload takes precedence. Override `ShouldRebuild(previous, next)` only when default structural equality does not match the component's rebuild policy.");
}

static void AppendCellFactoryGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("""
        ## Mount with a factory

        `Cell.Mount<TCell>(factory, key)` accepts a `System.Func<TCell>` and does not require a parameterless constructor. The factory can supply constructor dependencies or create an F# object expression. The existing mounts with configuration, seeding, or typed inputs remain available.

        ```gsharp
        Cell.Mount[Counter](() -> Counter(store), "counter")
        ```

        ```csharp
        Cell.Mount(() => new Counter(store), "counter")
        ```

        A mounted Cell is retained by its declared `TCell` and sibling key. The factory runs only when a new mount is needed. Rebuilding the parent, replacing its factory delegate, or changing values captured by the factory does not recreate the retained Cell. Use a different key when a different instance is required. When several factories return the base `Cell` type, give their distinct components distinct stable keys.

        Goo owns the returned Cell and disposes it when removed. Each factory invocation must return a fresh, unmounted, undisposed instance. Do not return one instance for multiple mounts or return a disposed instance after removal. A null factory or result is rejected.

        Constructor arguments are initialization, not changing input snapshots. For later updates, use typed inputs, configuration, or an external store read by `Build()`. Call the mounted Cell's `Rebuild()` after changes outside Goo input callbacks. Read changing values from the store or a getter instead of capturing a copied scalar. Calling a Cell's `Build()` directly only returns its Blob tree and does not mount that Cell.

        F# can call the CLR overload directly or through a helper:

        ```fsharp
        open System
        open Goo

        let mount key (create: unit -> Cell) =
            Cell.Mount<Cell>(Func<Cell>(create), key)

        let counter (value: int ref) =
            { new Cell() with
                override _.Build() =
                    Text(Content = $"Count: {value.Value}") :> Blob }

        let value = ref 0
        let direct = Cell.Mount<Cell>(Func<Cell>(fun () -> counter value), "direct")
        let throughHelper = mount "helper" (fun () -> counter value)
        ```

        Creating a capturing factory inside every parent build can allocate a new delegate and closure even when the Cell is reused. Cache the factory when its dependencies are stable. Goo does not invoke a factory merely to discover the created Cell's runtime type.
        """);
}

static void AppendStyleCompositionGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Compose reusable styles");
    text.AppendLine();
    text.AppendLine("`Style.BasedOn` copies another style's ordered declarations at its exact declaration position. Declarations written afterward win, as in `Container{ BasedOn: CardStyle, BackgroundColor: selectedColor }`. The destination does not retain the source Style or share its declaration log.");
    text.AppendLine();
    text.AppendLine("`BackgroundGradient: nil` is an explicit clear declaration. It removes an earlier composed or lower-state gradient while preserving `BackgroundColor`. Omitting `BackgroundGradient` leaves the earlier declaration in effect.");
}

static void AppendVirtualizationGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Virtualize complete data sources");
    text.AppendLine();
    text.AppendLine("`Virtual(items, itemWidth, itemHeight, itemKey, itemBuilder)` accepts the complete `IReadOnlyList<T>` source and one positive, finite logical width and height shared by every item. Goo derives list or wrapped-grid placement from `FlexDirection` and `FlexWrap`, then mounts only the viewport window plus one overscan line. The caller does not calculate a range, supply an item count, or choose a list or grid primitive.");
    text.AppendLine();
    text.AppendLine("The shared item extent is the sole source for placement and scroll range. Builder content is mounted inside that fixed extent and cannot resize the virtual layout. Variable-extent sources are unsupported.");
    text.AppendLine();
    text.AppendLine("Source order controls logical order, and `itemKey` supplies stable identity. Goo uses the item type's equality semantics to retain unchanged visible nodes without calling `itemBuilder`. Newly visible and changed items invoke the builder. Items leaving the viewport unmount through the ordinary Goo lifecycle, including focus, pointer capture, handles, and accessibility state. Keys must be unique and non-empty. Rebuild the owning Cell after same-count content changes. A live source count change is detected directly.");
}

static void AppendOwnedImageSourceGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Owned image sources");
    text.AppendLine();
    text.AppendLine("`Image.Source` and `Style.BackgroundImageSource` accept an `ImageSourceProvider`. A source wins over its local image path. Goo preserves the path for a later source removal, but never falls back to it after source failure.");
    text.AppendLine();
    text.AppendLine("`ImageSource(width, height, pixels)` copies one exact row-major premultiplied-RGBA buffer (`width * height * 4` bytes) into Goo-owned storage. Width and height must be positive. The buffer must be non-null and exactly that length. Disposing the source releases its owner reference while already-mounted leases remain usable until their elements unmount or replace the source.");
    text.AppendLine();
    text.AppendLine("`ImageSource.Transfer(width, height, pixels, released)` adopts the same validated buffer without copying. A successful call transfers ownership to Goo: the caller must not read, write, or reuse the array until `released` runs. Goo invokes that callback exactly once after it can no longer read the array. The callback may run synchronously during disposal, and its exceptions do not interrupt cleanup. Rejected arguments leave ownership with the caller and do not invoke the callback.");
    text.AppendLine();
    text.AppendLine("For streaming content, retain one provider identity and publish each frame as a new immutable source with a monotonically increasing `ContentVersion`. Superseded generations may remain alive until their callbacks return their buffers to a bounded producer pool; never mutate an in-flight generation.");
    text.AppendLine();
    text.AppendLine("Custom providers create one `ImageSourceLease` per mounted binding. Each lease completes once through `Complete(source)` or `Fail()`. Goo releases a replaced or unmounted lease synchronously and raises `Released` exactly once, so providers should cancel outstanding work from that event. Late completion returns `false`; callback exceptions cannot interrupt Goo cleanup. Stable source identity keeps its existing lease, so warm paints do not reacquire or lock provider state.");
    text.AppendLine();
    text.AppendLine("When one provider source advances versions, Vulkan keeps the last published version renderable until the replacement upload completes, then moves current references and fence-retires the old version. Stale older versions cannot supersede a newer registration. If the configured resident or logical-source budget cannot hold both versions, Goo keeps the last-good version rather than presenting an empty handoff.");
}

static void AppendLayoutTransitionGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Animate computed position changes");
    text.AppendLine();
    text.AppendLine("Set `Blob.LayoutTransition` to a `LayoutTransition(durationMs, easing)` value to glide a mounted element when its own computed layout slot changes. It is separate from style `TransitionProperties`. The visual rectangle used by painting, hit testing, metrics, descendants, and accessibility moves together. Ordinary scrolling and ancestor-only movement do not start another glide.");
}

static void AppendImageSourceProviderMembers(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("### `Acquire`");
    text.AppendLine();
    text.AppendLine("Creates the lease that Goo owns and disposes for one mounted image or background binding.");
}

static void AppendShaderEffectGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Apply fragment shaders to retained elements");
    text.AppendLine();
    text.AppendLine("Load one backend-neutral `ShaderEffectProgram`, create retained `ShaderEffect` state from it, and assign the effect through the ordinary `Style.ShaderEffect` property on a `Container`, `Button`, `Text`, `Image`, `Shape`, or another Blob. Goo renders that element and its subtree into a bounded offscreen layer, runs the selected backend artifact, then composites the result without changing layout, hit testing, accessibility, transforms, or clipping.");
    text.AppendLine();
    text.AppendLine("```gsharp");
    text.AppendLine("import System");
    text.AppendLine("import System.IO");
    text.AppendLine("import System.Numerics");
    text.AppendLine("import Goo");
    text.AppendLine();
    text.AppendLine("let path = Path.Combine(AppContext.BaseDirectory, \"Shaders\", \"glass.goo-effect\")");
    text.AppendLine("let program = ShaderEffectProgram.Load(path)");
    text.AppendLine("let effect = ShaderEffect(program,");
    text.AppendLine("  samplesBackdrop: true,");
    text.AppendLine("  backdropOutset: 24.0F)");
    text.AppendLine("effect.SetParameter(0, Vector4(0.18F, 0.65F, 0.9F, 1.0F))");
    text.AppendLine("let data = ShaderEffectData(BitConverter.GetBytes(1.0F))");
    text.AppendLine("effect.SetData(0, data)");
    text.AppendLine();
    text.AppendLine("let control = Button{");
    text.AppendLine("  Width: 180,");
    text.AppendLine("  Height: 52,");
    text.AppendLine("  BorderRadius: 18,");
    text.AppendLine("  ShaderEffect: effect,");
    text.AppendLine("}");
    text.AppendLine("```");
    text.AppendLine();
    text.AppendLine("Reuse the same effect instance for controls that share program and parameters. Create separate effect instances from the same program when controls need independent parameter state. Program sharing also shares the backend pipeline identity. `SetParameter` accepts slots 0 through 7, marks mounted users paint-dirty only when a value changes, and stays allocation-free after construction.");
    text.AppendLine();
    text.AppendLine("Set `Playing = true` to opt into continuous renderer-driven playback. `ElapsedSeconds` is supplied separately through `gooElapsedSeconds()`, so playback does not consume one of the eight parameter slots. Pausing preserves the current elapsed position, and assigning `ElapsedSeconds` seeks while paused or playing. Goo schedules continuous frames only while a playing effect is mounted.");
    text.AppendLine();
    text.AppendLine("Author ShaderEffects in native Slang by including Goo's fixed module and implementing `float4 gooEffect(float2 uv, float4 source, float4 backdrop)`. GLSL compatibility sources instead include `goo_effect.glsl` and implement the equivalent `vec4` function. `gooDataByteLength(slot)` and `gooDataWord(slot, wordIndex)` read retained data slots zero through three; invalid slots and out-of-range words return zero.");
    text.AppendLine();
    text.AppendLine("```slang");
    text.AppendLine("#include \"goo_effect.slang\"");
    text.AppendLine();
    text.AppendLine("float4 gooEffect(float2 uv, float4 source, float4 backdrop)");
    text.AppendLine("{");
    text.AppendLine("    float gain = gooDataByteLength(0) >= 4 ? asfloat(gooDataWord(0, 0)) : 1.0;");
    text.AppendLine("    float pulse = 0.5 + 0.5 * sin(gooElapsedSeconds());");
    text.AppendLine("    return lerp(source, backdrop, gooParameter(0).x * pulse) * gain;");
    text.AppendLine("}");
    text.AppendLine("```");
    text.AppendLine();
    text.AppendLine("Add the source to the G# project:");
    text.AppendLine();
    text.AppendLine("```xml");
    text.AppendLine("<ItemGroup>");
    text.AppendLine("  <GooShaderEffect Include=\"Shaders/glass.slang\" />");
    text.AppendLine("</ItemGroup>");
    text.AppendLine("```");
    text.AppendLine();
    text.AppendLine("Build requires the pinned Slang 2026.16 compiler through `SLANG_SDK` or `PATH` and SPIRV-Tools 2026.3 from Vulkan SDK 1.4.357.0 through `VULKAN_SDK` or `PATH`. Goo compiles and validates the source during the build, writes deterministic intermediates under `obj`, and copies `Shaders/glass.goo-effect` plus `Shaders/glass.goo-effect.json` provenance to build and publish output. The program container can carry separate artifacts for multiple rendering backends. The current compiler emits Vulkan SPIR-V. Set `TargetPath` on `GooShaderEffect` to override the relative output path. Unchanged inputs skip compilation. Tool-version mismatches, compiler errors, validation errors, ABI mismatches, and unsupported capabilities fail the build.");
    text.AppendLine();
    text.AppendLine("The fixed ABI binds the isolated source at set 0, the optional backdrop at set 1, Goo primitive data at set 2, Goo clip data at set 3, optional retained effect data at set 4, and eight `vec4` values in a 128-byte fragment push block. `uv` is normalized to the visible element bounds. `source` and `backdrop` are premultiplied linear colors. Return premultiplied linear color. Goo applies retained clip coverage and element opacity after `gooEffect`. Set `backdropOutset` to the largest displacement or filter radius the shader needs beyond those bounds. When backdrop sampling is disabled, the backdrop argument aliases the source and Goo skips the target copy.");
    text.AppendLine();
    text.AppendLine("Each `ShaderEffectData` publication is a complete replacement. The constructor and `Publish` copy bytes. `Transfer` and `PublishTransferred` take array ownership and invoke the supplied callback after Goo no longer reads that publication. Each source is limited to 16 MiB, each compiled scene frame is limited to 64 MiB of effect data, and unchanged retained versions reuse the existing upload. Goo recreates device-local data from the retained publication after device recovery.");
    text.AppendLine();
    text.AppendLine("The compiled program stays a sidecar asset in JIT and NativeAOT builds. Goo packages the build adapter, but neither the adapter, authoring modules, nor compiler toolchains are copied to application output. Goo does not invoke a runtime shader compiler. The first use creates a backend pipeline in a device-generation cache. Warm parameter updates reuse that pipeline and the retained layer pool. One target format supports up to 32 distinct effect program identities per device generation. A non-normal `BlendMode` cannot currently share the same element with `ShaderEffect`.");
}

static void AppendAccessibilityGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Use accessibility semantics");
    text.AppendLine();
    text.AppendLine("Set `Blob.Accessibility` to declare role, name, description, value, state, relationships, and composed-control actions. The model is backend-neutral. An `AccessibilityAdapter` maps the retained tree to a platform API.");
    text.AppendLine();
    text.AppendLine("Native primitives publish defaults: text, button, text entry, editor, and image. `Role.None` removes only its own node and keeps semantic descendants. `Hidden` removes the complete subtree. Display and visibility exclusion also remove a subtree.");
    text.AppendLine();
    text.AppendLine("Semantic IDs are stable for the mounted window lifetime. Adapters receive mutable retained node and tree views. Read each view again after an update. Call the adapter and route actions only on Goo's UI thread.");
    text.AppendLine();
    text.AppendLine("`AccessibilityTree` exposes `Root` and monotonic `Version`. Each `AccessibilityNode` exposes ID, role, name, value, state, bounds, actions, children, relationships, and editor `TextSnapshot`, selection, and caret. `AccessibilityRelationshipIds` exposes ordered ID lists plus an active descendant.");
    text.AppendLine();
    text.AppendLine("Replacing an adapter delivers the current retained tree to the replacement. A failed delivery retries once on a later UI update and exposes `Window.LastAccessibilityError`.");
    text.AppendLine();
    text.AppendLine("Use `ElementHandle` relationships only for mounted nodes in the same window. Hidden, flattened, detached, and foreign targets are omitted.");
    text.AppendLine();
    text.AppendLine("Route neutral actions with `new AccessibilityActionRequest(action)`. Use `SetValue`, `SetSelection`, and `Scroll` factories for payload actions. `Window.PerformAccessibilityAction` checks the advertised capability before routing built-in or declared actions.");
    text.AppendLine();
    text.AppendLine("Protected `TextEntry` nodes expose one bullet per extended grapheme cluster. Their value, selection, and caret use this masked semantic coordinate space. Copy and cut do not expose or remove protected text, while paste and `SetValue` remain available.");
    text.AppendLine();
    text.AppendLine("Text editors expose `TextSnapshot`, selection, and caret metadata. The snapshot is versioned and avoids a full document copy.");
}

static void AppendWindowDispatcherGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Post UI work");
    text.AppendLine();
    text.AppendLine("Call `Window.Post` from any thread. Accepted actions use FIFO order. Post accepts work before the first `Open`. A pending `RequestClose` still accepts work because `OnClosing` can veto the request.");
    text.AppendLine();
    text.AppendLine("Use `TryPost` when teardown can race the producer. It returns `false` after posting closes instead of throwing. `true` means the action was atomically accepted into the queue, not that it is guaranteed to execute, because later teardown may still discard queued work.");
    text.AppendLine();
    text.AppendLine("Each `Pump` drains one fixed accepted batch after close decisions and native metrics, and before input. Posts made while that batch runs wait for the next `Pump`. When native closing or teardown starts, Goo discards queued work. Teardown is terminal and later `Post` calls throw `InvalidOperationException`.");
    text.AppendLine();
    text.AppendLine("Pump removes an action before it calls the action. If it throws, Pump throws the same exception and later queued actions remain for the next direct `Pump`. `Run` propagates the exception, then closes the window and discards queued work. Accessibility adapters can use `Post` before calling Window accessibility APIs.");
}

static void AppendWindowMetricsGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Observe window metrics");
    text.AppendLine();
    text.AppendLine("Subscribe to `Window.MetricsChanged` on the UI thread. Goo delivers an immutable snapshot after queued native metrics and tree layout settle. A callback can queue UI work, but it must not expect recursive layout.");
    text.AppendLine();
    text.AppendLine("The snapshot reports the dimensions from the latest native metrics event. A zero framebuffer dimension is reported as zero and its corresponding display scale is zero. Goo keeps the prior render target while minimized or otherwise zero-sized.");
    text.AppendLine();
    text.AppendLine("Equal snapshots do not notify. A listener added after another listener has already received the current snapshot waits for a real change. Removing the final listener resets that listener stream, so a later first listener receives a new initial snapshot.");
}

static void AppendWindowNotificationGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Observe window notifications");
    text.AppendLine();
    text.AppendLine("Subscribe to `StateChanged`, `FocusChanged`, and `KeyPressed` with `+=` on the window UI thread. Each event supports independent listeners. Remove listeners with `-=` when their ownership ends.");
    text.AppendLine();
    text.AppendLine("`OnClosing` is different: it is the single close-policy callback, and returning `false` vetoes the pending close request.");
}

static void AppendClipboardGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Use the native clipboard");
    text.AppendLine();
    text.AppendLine("Call `Window.GetClipboardText` and `Window.SetClipboardText` only on the open window's UI thread. Both fail deterministically after close. An empty getter result can mean either an empty clipboard or a native copy failure; setter failures propagate. Built-in text entry and editor shortcuts use the same native clipboard path.");
}

static void AppendTextInputGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Receive generic text and IME input");
    text.AppendLine();
    text.AppendLine("A focusable `Blob` can opt into `OnTextInput`, `OnTextComposition`, `OnTextCompositionCancel`, and `OnTextCandidates`. Committed text and composition offsets use UTF-16. Invalid or surrogate-splitting composition selections are delivered as the empty range. Candidate snapshots are read-only and use `SelectedCandidate = -1` when native selection is invalid.");
    text.AppendLine();
    text.AppendLine("Callbacks run only for the currently focused, enabled, visible client. Queued text is bound to the focus generation that received it, so it is discarded after a focus transfer, including a transfer back to the original element. `TextEntry` and `TextEditor` retain their existing default behavior before these observers run. Goo provides no candidate UI; applications own candidate presentation.");
}

static void AppendKeyboardFocusGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Route keyboard and focus callbacks");
    text.AppendLine();
    text.AppendLine("`OnKeyDown` and `OnKeyUp` start at the currently focused element and bubble through its parents, so an ancestor can own shortcuts for a subtree. `KeyEvent.StopPropagation()` ends that route before the next ancestor without canceling Goo's default action. `KeyEvent.PreventDefault()` cancels the default action without stopping the remaining callbacks. Both controls are active only during that route; retaining the event value cannot affect a later dispatch.");
    text.AppendLine();
    text.AppendLine("Key-down defaults run after the route and include text editing, `Tab` or `Shift+Tab` traversal, and `Button` Enter or Space press behavior. Preventing the matching Space key-up cancels release activation. Repeated key downs use the same route with `Repeat: true` and resolve the current focus target again for each repeat.");
    text.AppendLine();
    text.AppendLine("A focus transfer updates the old and new `Focused` states first, then routes `OnBlur` from the old element to its parents and `OnFocus` from the new element to its parents. These lifecycle callbacks cannot cancel the transfer. `FocusEvent.StopPropagation()` only skips the remaining ancestors. A reentrant focus request from `OnBlur` or `OnFocus` wins over the superseded transfer.");
    text.AppendLine();
    text.AppendLine("Set `Focusable: true` on a generic Blob. `Button`, `TextEntry`, and `TextEditor` are focusable by default. During a rebuilt tree update, `AutoFocus` selects the first eligible element only when nothing else holds focus. `Tab` and `Shift+Tab` visit enabled, visible focusables in depth-first tree order and wrap at the ends. An unprevented primary pointer press focuses the deepest focusable element in its hit route. `ElementHandle.Focus()` and `ElementHandle.Blur()` use the same mounted, visible, enabled eligibility rules.");
}

static void AppendPointerLifecycleGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Receive pointer lifecycle and pressure input");
    text.AppendLine();
    text.AppendLine("`OnPointerEnter` and `OnPointerLeave` are sparse, non-bubbling lifecycle callbacks. They run only for mouse hover-route changes. Goo sends leaves from the old route leaf to root, then enters from the new route root to leaf. Shared route ancestors receive neither callback. Removal, disable, hidden state, focus loss, and transformed hit routes use the same order.");
    text.AppendLine();
    text.AppendLine("`PointerEvent.IsPrimary` is true for the mouse and the first active touch or pen contact in a device-type sequence. The primary contact stays primary through its up callback. Goo does not promote another held contact during that sequence.");
    text.AppendLine();
    text.AppendLine("`PointerEvent.Pressure` is normalized to the inclusive range from 0 to 1. Mouse pressure is 1 only while the primary button is held and 0 otherwise. Touch samples every SDL down, move, and up event. Pen samples its latest pressure-axis value on the next down, move, up, or pen-button event. A pressure-axis event alone emits no `PointerMove`. A pen proximity-out clears that pen's sampled pressure. Goo does not coalesce movement or expose tilt, twist, contact geometry, raw history, or gesture recognition.");
}

static void AppendDragDropGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Transfer data within a Goo window");
    text.AppendLine();
    text.AppendLine("Attach an optional `DragSource` or `DropTarget` descriptor to a `Blob`. Goo records a source candidate after an unclaimed primary press. It calls `DragSource.Create` once when movement reaches four logical pixels. Returning null rejects the drag and preserves normal click behavior. Returning `DragData` captures the initiating pointer and suppresses its click.");
    text.AppendLine();
    text.AppendLine("`DragData.AllowedEffects` must contain `Copy`, `Move`, or both. A target query accepts by returning exactly one allowed effect. Any other value is treated as `None`. Goo hit-tests independently of source capture, honors clipping and transforms, and walks from the deepest target to its ancestors. It queries again when pointer modifiers change, after input-affecting tree updates, and immediately before release. A target with no `Changed` callback can accept a no-op drop through `Query`.");
    text.AppendLine();
    text.AppendLine("The selected target receives `Enter`, `Move`, `Leave`, and `Drop` snapshots through `Changed`. Positions are current target-local and logical-window coordinates. A successful `Drop` remains successful when its callback removes or reparents the target or source. Goo makes no further callback to a detached owner.");
    text.AppendLine();
    text.AppendLine("Escape, pointer cancellation, focus loss, window close, source removal or disablement, and callback failure cancel the session. Internal termination and capture cleanup run once. `DragSource.End` runs at most once only while its source remains mounted. Goo strongly retains the payload through an eligible `End`, then releases it. Goo never calls `Dispose` on consumer payloads. Callback cleanup preserves the original exception.");
    text.AppendLine();
    text.AppendLine("One pointer drag can be active per window. Goo provides no drag preview, automatic scrolling, native transfer, or generic keyboard target navigation. Applications must expose an equivalent keyboard and accessibility action when drag movement affects application state.");
}

static void AppendTextInputAreaGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Position a custom IME");
    text.AppendLine();
    text.AppendLine("A focused generic text client can call `ElementHandle.SetTextInputArea` with a finite, non-negative logical-window rectangle. Goo floors the origin, ceils the far edge, and passes cursor offset zero to the native IME. The call returns false for unmounted, unfocused, built-in, closed-window, nonparticipating, or native-IME-unavailable elements. Invalid and out-of-range rectangles throw.");
}

static void AppendElementMetricsGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Observe mounted element metrics");
    text.AppendLine();
    text.AppendLine("Subscribe to `ElementHandle.MetricsChanged` on the UI thread. The immutable snapshot contains mounted state, transformed border and content boxes in window logical coordinates, the actual scroll offset, and the maximum legal scroll range.");
    text.AppendLine();
    text.AppendLine("Goo calls listeners after reconciliation, layout, rect refresh, and scroll stepping settle. Detach produces one final `IsMounted = false` snapshot after tree disposal. A detach followed by reattach in the same update reports only the final mounted state.");
    text.AppendLine();
    text.AppendLine("Subscription state is sparse. Handles without a listener and ordinary blobs and nodes do not retain metrics state. New handle subscriptions made during metric delivery wait for the next update. Listener changes on an already accepted handle follow ordinary live event behavior.");
}

static void AppendScrollGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Control scrolling");
    text.AppendLine();
    text.AppendLine("Set `OverflowX` or `OverflowY` to `Scroll` and attach an `ElementHandle`. `ScrollTo` updates the smoothed target, `JumpTo` applies an immediate clamped offset, and `ScrollIntoView` adjusts every scrollable ancestor. `ScrollOffset` is the displayed position and `ScrollRange` is the maximum legal X/Y offset.");
    text.AppendLine();
    text.AppendLine("`ScrollbarVisibility.Auto` shows the built-in Vulkan thumb during wheel, programmatic, or drag interaction and then fades it. `Always` keeps the thumb rendered and draggable without creating idle frame demand. `Hidden` suppresses only the built-in thumb; scrolling and custom scrollbar composition continue working.");
    text.AppendLine();
    text.AppendLine("A custom thumb can derive content size as viewport size plus scroll range. Its length is `track * viewport / content`, and its position is `(track - thumb) * offset / range`. Use `JumpTo` while dragging so content stays under the pointer.");
}

static string BuildIndex(string[] sourceDirectories)
{
    var text = new StringBuilder();
    text.AppendLine("# Goo API");
    text.AppendLine();
    text.AppendLine("These pages are generated from the Release `Goo.xml` file.");
    text.AppendLine();
    foreach (var path in sourceDirectories)
    {
        var name = Path.GetFileName(path);
        text.AppendLine($"- [{name}]({name.ToLowerInvariant()}.md)");
    }
    return text.ToString();
}

static IEnumerable<ApiType> ReadTypes(string directoryPath, string sourceRoot)
{
    var typePattern = new Regex(
        @"(?m)^public\s+(?:(?:partial|sealed|open|data)\s+)*(?<kind>class|struct|enum|interface)\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)(?<generic>\[[^\]\r\n]+\])?",
        RegexOptions.CultureInvariant);
    foreach (var file in Directory.EnumerateFiles(directoryPath, "*.gs", SearchOption.AllDirectories)
        .Order(StringComparer.Ordinal))
    {
        var source = File.ReadAllText(file);
        foreach (Match match in typePattern.Matches(source))
        {
            var name = match.Groups["name"].Value;
            var generic = match.Groups["generic"].Value;
            var arity = generic.Length == 0 ? 0 : generic.Count(character => character == ',') + 1;
            var xmlName = "Goo." + name + (arity == 0 ? "" : "`" + arity);
            var values = match.Groups["kind"].Value == "enum"
                ? ReadEnumValues(source, match.Index + match.Length)
                : [];
            yield return new ApiType(
                Path.GetFileName(directoryPath),
                name + generic.Replace('[', '<').Replace(']', '>'),
                xmlName,
                ReadSourceSummary(source, match.Index),
                values,
                [new ApiSource(
                    Path.GetRelativePath(directoryPath, file).Replace(Path.DirectorySeparatorChar, '/'),
                    Path.GetFileName(file))]);
        }
    }
}

static IReadOnlyList<string> ReadEnumValues(string source, int start)
{
    var open = source.IndexOf('{', start);
    if (open < 0)
        return [];
    var depth = 0;
    var close = -1;
    for (var index = open; index < source.Length; index++)
    {
        if (source[index] == '{')
            depth++;
        else if (source[index] == '}' && --depth == 0)
        {
            close = index;
            break;
        }
    }
    if (close < 0)
        return [];

    var body = Regex.Replace(source[(open + 1)..close], @"(?m)^\s*///.*$", "");
    return body.Split(';', StringSplitOptions.RemoveEmptyEntries)
        .Select(part => Regex.Match(part, @"^\s*(?<name>[A-Za-z_][A-Za-z0-9_]*)"))
        .Where(match => match.Success)
        .Select(match => match.Groups["name"].Value)
        .ToArray();
}

static string ReadSourceSummary(string source, int declarationStart)
{
    var lines = source[..declarationStart].Replace("\r\n", "\n").Split('\n').ToList();
    while (lines.Count != 0 && (lines[^1].Trim().Length == 0 || lines[^1].TrimStart().StartsWith('@')))
        lines.RemoveAt(lines.Count - 1);
    var summary = new List<string>();
    while (lines.Count != 0 && lines[^1].TrimStart().StartsWith("///", StringComparison.Ordinal))
    {
        summary.Add(lines[^1].TrimStart()[3..].Trim());
        lines.RemoveAt(lines.Count - 1);
    }
    summary.Reverse();
    return Normalize(string.Join(' ', summary));
}

static bool BelongsTo(string id, string xmlTypeName) =>
    id.StartsWith("M:" + xmlTypeName + ".", StringComparison.Ordinal) ||
    id.StartsWith("P:" + xmlTypeName + ".", StringComparison.Ordinal) ||
    id.StartsWith("F:" + xmlTypeName + ".", StringComparison.Ordinal) ||
    id.StartsWith("E:" + xmlTypeName + ".", StringComparison.Ordinal);

static string DisplayMember(ApiMember member, ApiType type)
{
    var value = member.Id[(type.XmlName.Length + 3)..];
    var methodParameters = member.Element.Elements("typeparam")
        .Select(element => element.Attribute("name")?.Value ?? "T")
        .ToArray();
    for (var index = 0; index < methodParameters.Length; index++)
        value = value.Replace("``" + index, methodParameters[index], StringComparison.Ordinal);
    var typeParameters = GenericNames(type.DisplayName);
    for (var index = 0; index < typeParameters.Length; index++)
        value = value.Replace("`" + index, typeParameters[index], StringComparison.Ordinal);
    return value
        .Replace("#ctor", "new", StringComparison.Ordinal)
        .Replace("System.Boolean", "bool", StringComparison.Ordinal)
        .Replace("System.Double", "float64", StringComparison.Ordinal)
        .Replace("System.Single", "float32", StringComparison.Ordinal)
        .Replace("System.Int32", "int32", StringComparison.Ordinal)
        .Replace("System.String", "string", StringComparison.Ordinal)
        .Replace("Goo.", "", StringComparison.Ordinal);
}

static string[] GenericNames(string displayName)
{
    var open = displayName.IndexOf('<');
    return open < 0
        ? []
        : displayName[(open + 1)..^1].Split(',', StringSplitOptions.TrimEntries);
}

static string Summary(XElement element) => Normalize(element.Element("summary")?.Value);

static string Normalize(string? value) =>
    Regex.Replace(value ?? "", @"\s+", " ").Trim();

static void AppendText(StringBuilder text, string value)
{
    if (value.Length == 0)
        return;
    text.AppendLine();
    text.AppendLine(value);
}

static void WriteIfChanged(string path, string content)
{
    content = content.Replace("\r\n", "\n");
    if (File.Exists(path) && File.ReadAllText(path) == content)
        return;
    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
    File.WriteAllText(path, content, new UTF8Encoding(false));
}

static Dictionary<string, string> ParseArguments(string[] values)
{
    var result = new Dictionary<string, string>(StringComparer.Ordinal);
    for (var index = 0; index < values.Length; index += 2)
    {
        if (!values[index].StartsWith("--", StringComparison.Ordinal) || index + 1 >= values.Length)
            throw new ArgumentException("Use --xml, --source, or --output followed by a path.");
        result[values[index][2..]] = values[index + 1];
    }
    return result;
}

static string Resolve(string? value, string fallback) =>
    Path.GetFullPath(value ?? fallback);

static string FindRepositoryRoot(string start)
{
    for (var directory = new DirectoryInfo(start); directory is not null; directory = directory.Parent)
    {
        if (File.Exists(Path.Combine(directory.FullName, "Goo", "Goo.gsproj")))
            return directory.FullName;
    }
    throw new DirectoryNotFoundException("Could not find the Goo repository root.");
}

sealed record ApiType(
    string Directory,
    string DisplayName,
    string XmlName,
    string Summary,
    IReadOnlyList<string> EnumValues,
    IReadOnlyList<ApiSource> Sources);

sealed record ApiSource(string RelativeFile, string FileName);

sealed record ApiMember(string Id, XElement Element);
