using System;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Threading.Tasks;

namespace Goo.Browser.Interop;

[SupportedOSPlatform("browser")]
public static partial class BrowserInterop
{
    [JSImport("initialize", "goo-browser")]
    public static partial Task<int> Initialize(string canvas, string vertex, string solid, string border,
        [JSMarshalAs<JSType.Function<JSType.Number>>] Action<double> frame,
        [JSMarshalAs<JSType.Function<JSType.Number, JSType.Number, JSType.Number>>] Action<double, double, double> resize,
        [JSMarshalAs<JSType.Function<JSType.Number, JSType.Number, JSType.Number>>] Action<double, double, double> pointer,
        [JSMarshalAs<JSType.Function<JSType.Boolean>>] Action<bool> visibility);

    [JSImport("schedule", "goo-browser")]
    public static partial void Schedule(int host, double delaySeconds);

    [JSImport("submit", "goo-browser")]
    public static partial void Submit(int host, int pointer, int count);

    [JSImport("dispose", "goo-browser")]
    public static partial void Dispose(int host);
}
