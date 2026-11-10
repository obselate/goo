package Goo

import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Linq
import System.Threading

/// Renders app command frames without native presentation.
public partial class Window {
    /// Gets named, unattached Cell factories registered for display-free rendering.
    public prop Scenes IReadOnlyDictionary[string, Func[Cell]]? {
        get;
        init;
    }

    private func RenderCommandFrame(output string) {
        if Environment.GetEnvironmentVariable("GOO_RENDER_LIST") == "1" {
            if let scenes = Scenes {
                for name in scenes.Keys.Order(StringComparer.Ordinal) {
                    Console.WriteLine(name)
                }
            } else { Console.WriteLine("default") }
            return
        }
        applyPreferences(PlatformPreferences{
            Theme: Environment.GetEnvironmentVariable("GOO_RENDER_THEME") == "dark" ? SystemTheme.Dark : SystemTheme.Light
        })
        var root = Root ?? throw InvalidOperationException("goo render requires a window Root")
        let scene = Environment.GetEnvironmentVariable("GOO_RENDER_SCENE") ?? ""
        if let scenes = Scenes {
            if scene != "" {
                if !scenes.TryGetValue(scene, out var factory) {
                    throw ArgumentException(
                        "Unknown scene '$scene'. Available scenes: " + string.Join(
                            ", ",
                            scenes.Keys.Order(StringComparer.Ordinal)
                        )
                    )
                }
                root = factory()
            }
        } else if scene != "" && scene != "default" {
            throw ArgumentException("Unknown scene '$scene'. Available scenes: default")
        }
        var renderWidth = Width
        var renderHeight = Height
        if let size = Environment.GetEnvironmentVariable("GOO_RENDER_SIZE") {
            let parts = size.Split('x')
            renderWidth = Int32.Parse(parts[0], CultureInfo.InvariantCulture)
            renderHeight = Int32.Parse(parts[1], CultureInfo.InvariantCulture)
        }
        let scale = Double.Parse(
            Environment.GetEnvironmentVariable("GOO_RENDER_SCALE") ?? "1",
            CultureInfo.InvariantCulture
        )
        let options = OffscreenRenderOptions(
            float32(renderWidth),
            float32(renderHeight),
            checked(uint32(Math.Ceiling(renderWidth * scale))),
            checked(uint32(Math.Ceiling(renderHeight * scale))),
            Background,
            536870912
        )
        let creation = OffscreenRenderSession.Create()
        using let session = creation.Session ?? throw InvalidOperationException("Offscreen renderer: " + creation.Error)
        session.Foreground = Foreground
        using let cancellation = CancellationTokenSource(TimeSpan.FromSeconds(30))
        let pending = session.RenderAsync(root, options, cancellation.Token)
        while !pending.IsCompleted {
            session.Service()
            Thread.Sleep(1)
        }
        let result = pending.GetAwaiter().GetResult()
        let capture = result.Capture ?? throw InvalidOperationException(
            "Offscreen render: ${result.Status}" + (String.IsNullOrEmpty(result.Error) ? "" : ": " + result.Error)
        )
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!!)
        File.WriteAllBytes(
            output,
            ImageSource.EncodePng(int32(capture.Width), int32(capture.Height), capture.Pixels, true, Int32.MaxValue)
        )
        Console.WriteLine("[goo] frame: ${capture.Width}x${capture.Height}")
    }
}
