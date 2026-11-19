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
        var bytes = GC.AllocateUninitializedArray<byte>(checked((int)stream.Length));
        stream.ReadExactly(bytes, 0, bytes.Length);
        new FontSource("sans-serif", 400, false, bytes).Register();
        if (OperatingSystem.IsBrowser()) BrowserWindowHost.Configure();
    }
}
