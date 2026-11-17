using Goo;
using Goo.Wasm;
using System.Reflection;
using System.Runtime.CompilerServices;

internal static class Host
{
    private static void Main(string[] args) =>
        typeof(Interop.CSharp.Counter).Assembly.GetType("Interop.CSharp.Program")!
            .GetMethod("Main", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, [args]);

    [ModuleInitializer]
    internal static void Initialize()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Goo.Counter.Font.ttf")
            ?? throw new InvalidOperationException("Missing counter font");
        using var bytes = new MemoryStream();
        stream.CopyTo(bytes);
        new FontSource("sans-serif", 400, false, bytes.ToArray()).Register();
        if (OperatingSystem.IsBrowser()) BrowserWindowHost.Configure();
    }
}
