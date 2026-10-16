# Ship a desktop app

Verified on Linux x64 with .NET SDK 10.0.401, Gsharp.NET.Sdk 0.4.1150,
Goo, Goo.Svg and Goo.Templates 0.7.35, and Goo.Widgets 0.2.19.
The commands below were executed in `/tmp` on 2026-10-16.

## Create and extend the template

Meet the [platform preflight](platform-preflight.md) first. The starter does not
need a source checkout, a Vulkan SDK, or shader tools.

```sh
dotnet new install Goo.Templates@0.7.35
mkdir -p /tmp/goo-ship
cd /tmp/goo-ship
dotnet new goo
dotnet add package Goo.Widgets --version 0.2.19
dotnet add package Goo.Svg --version 0.7.35
```

Installation listed `Goo application / goo`. Creation returned
`The template "Goo application" was created successfully.` Both package additions
succeeded. Keep the generated SDK version unchanged.

Create `Assets/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#4a7dff" />
  <path d="M16 8v16M8 16h16" stroke="white" stroke-width="3" />
</svg>
```

Add this item to the existing project `ItemGroup`. It copies assets for both local
builds and publishing, and preserves the `Assets` directory:

```xml
<Content Include="Assets/**/*" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />
```

Replace `Program.gs` with:

```gsharp
package goo_ship

import Goo
import Goo.Svg
import Goo.Widgets.Actions
import System
import System.IO

class Counter : Cell {
    private var count int32
    private var icon VectorAsset = Svg.Load(Path.Combine(AppContext.BaseDirectory, "Assets", "icon.svg"))

    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        Padding: 24,
        Gap: 12,
        BackgroundColor: Color.Rgb(24, 31, 43),
        Text{Content: "Count: $count", FontSize: 24, Color: Color.White},
        Container{Width: 32, Height: 32, icon.Render(),},
        ActionButton{Content: "Add one", OnClick: () -> { count++ }}.Build(),
    }
}

func Main() {
    Window.ConfigureApplication("Goo starter", "1.0.0", "com.example.goo_ship")
    Window{Title: "Goo starter", Width: 360, Height: 220, Root: Counter{}}.Run()
}
```

The Cell retains the parsed vector instead of loading it on every rebuild.
`AppContext.BaseDirectory` resolves the copied asset next to the app, not relative
to the caller's working directory. `VectorAsset` has no disposal contract.
See [SVG limits](../Goo.Svg/README.md) and [build recipes](build-recipes.md).

## Publish Linux x64

```sh
dotnet publish -c Release -r linux-x64 --self-contained true -o /tmp/goo-ship/publish -m:2 -nodeReuse:false -p:UseSharedCompilation=false
cd /tmp
timeout 8s /tmp/goo-ship/publish/goo_ship
du -sh /tmp/goo-ship/publish
```

Publish succeeded. The app opened a 360 by 220 Wayland window from `/tmp`.
The eight-second watchdog returned 124 as intended. Protocol evidence recorded
`set_title("Goo starter")`, a buffer attachment, and surface entry into an output.
This checks startup and asset lookup, not button interaction or pixel accuracy.
Validation also set `DOTNET_ROOT` to a nonexistent directory to check that the
published app did not need an installed .NET runtime.

Measured allocated size:

```text
93M /tmp/goo-ship/publish
```

Distribute the whole publish directory. It contains the apphost `goo_ship`, app
assemblies, the CLR, Goo native libraries, license files and `Assets/icon.svg`.
Self-contained means the .NET runtime is included. It does not include the GPU
driver, Wayland compositor, system fonts, or every OS library.

## Other RIDs and publish modes

| Choice | Current contract |
| --- | --- |
| `win-x64` | Use this RID for Windows x64. Validate on Windows 11 with current vendor Vulkan drivers. No minimum Windows version is established. |
| `osx-arm64` | Use this RID for Apple silicon, macOS 14 or newer. Goo packages MoltenVK and native dylibs. A publish directory is not a signed `.app` bundle or a notarized installer. |
| Trimming | The guide leaves trimming off. `PublishTrimmed` removes managed code, not assets or platform requirements. Review all trimmer warnings and test the actual app, especially reflection and optional packages. Do not suppress warnings to claim support. |
| NativeAOT | Goo CI publishes native smoke apps for Linux x64, Windows x64 and macOS arm64. Linux package targets statically link the three Goo native archives. AOT is a separate publish mode with native compiler/linker prerequisites and no JIT. It does not embed arbitrary SVG, fonts or custom shader sidecars. Other platforms can retain native sidecars. |
| Single-file | .NET single-file bundling is not NativeAOT. Native libraries remain sidecars unless native self-extraction is enabled. Ordinary `Content` assets remain separate. Goo does not automatically turn this sample into a one-file distribution. Keep base-directory assets or explicitly embed and load them. |

Only the Linux self-contained recipe above was run for this guide. Other RIDs,
trimming, AOT and single-file are not claimed as tested variants of this sample.
The repository [CI workflow](../.github/workflows/ci.yml) records the native smoke
contracts. Test each release on its target OS and minimum supported baseline.

## Observed publish file list

The complete relative file list follows. This is an untrimmed output inventory,
not a list of files that are safe to remove.

<details>
<summary>Complete file list (212 files)</summary>

```text
Assets/icon.svg
Goo.Svg.dll
Goo.Widgets.dll
Goo.dll
Gsharp.Extensions.dll
Gsharp.Extensions.pdb
Gsharp.Extensions.xml
Gsharp.Runtime.Channels.dll
Gsharp.Runtime.Channels.pdb
Gsharp.Runtime.Values.dll
Gsharp.Runtime.Values.pdb
Hexa.NET.SDL3.dll
HexaGen.Runtime.dll
Microsoft.CSharp.dll
Microsoft.VisualBasic.Core.dll
Microsoft.VisualBasic.dll
Microsoft.Win32.Primitives.dll
Microsoft.Win32.Registry.dll
System.AppContext.dll
System.Buffers.dll
System.Collections.Concurrent.dll
System.Collections.Immutable.dll
System.Collections.NonGeneric.dll
System.Collections.Specialized.dll
System.Collections.dll
System.ComponentModel.Annotations.dll
System.ComponentModel.DataAnnotations.dll
System.ComponentModel.EventBasedAsync.dll
System.ComponentModel.Primitives.dll
System.ComponentModel.TypeConverter.dll
System.ComponentModel.dll
System.Configuration.dll
System.Console.dll
System.Core.dll
System.Data.Common.dll
System.Data.DataSetExtensions.dll
System.Data.dll
System.Diagnostics.Contracts.dll
System.Diagnostics.Debug.dll
System.Diagnostics.DiagnosticSource.dll
System.Diagnostics.FileVersionInfo.dll
System.Diagnostics.Process.dll
System.Diagnostics.StackTrace.dll
System.Diagnostics.TextWriterTraceListener.dll
System.Diagnostics.Tools.dll
System.Diagnostics.TraceSource.dll
System.Diagnostics.Tracing.dll
System.Drawing.Primitives.dll
System.Drawing.dll
System.Dynamic.Runtime.dll
System.Formats.Asn1.dll
System.Formats.Tar.dll
System.Globalization.Calendars.dll
System.Globalization.Extensions.dll
System.Globalization.dll
System.IO.Compression.Brotli.dll
System.IO.Compression.FileSystem.dll
System.IO.Compression.ZipFile.dll
System.IO.Compression.dll
System.IO.FileSystem.AccessControl.dll
System.IO.FileSystem.DriveInfo.dll
System.IO.FileSystem.Primitives.dll
System.IO.FileSystem.Watcher.dll
System.IO.FileSystem.dll
System.IO.IsolatedStorage.dll
System.IO.MemoryMappedFiles.dll
System.IO.Pipelines.dll
System.IO.Pipes.AccessControl.dll
System.IO.Pipes.dll
System.IO.UnmanagedMemoryStream.dll
System.IO.dll
System.Linq.AsyncEnumerable.dll
System.Linq.Expressions.dll
System.Linq.Parallel.dll
System.Linq.Queryable.dll
System.Linq.dll
System.Memory.dll
System.Net.Http.Json.dll
System.Net.Http.dll
System.Net.HttpListener.dll
System.Net.Mail.dll
System.Net.NameResolution.dll
System.Net.NetworkInformation.dll
System.Net.Ping.dll
System.Net.Primitives.dll
System.Net.Quic.dll
System.Net.Requests.dll
System.Net.Security.dll
System.Net.ServerSentEvents.dll
System.Net.ServicePoint.dll
System.Net.Sockets.dll
System.Net.WebClient.dll
System.Net.WebHeaderCollection.dll
System.Net.WebProxy.dll
System.Net.WebSockets.Client.dll
System.Net.WebSockets.dll
System.Net.dll
System.Numerics.Vectors.dll
System.Numerics.dll
System.ObjectModel.dll
System.Private.CoreLib.dll
System.Private.DataContractSerialization.dll
System.Private.Uri.dll
System.Private.Xml.Linq.dll
System.Private.Xml.dll
System.Reflection.DispatchProxy.dll
System.Reflection.Emit.ILGeneration.dll
System.Reflection.Emit.Lightweight.dll
System.Reflection.Emit.dll
System.Reflection.Extensions.dll
System.Reflection.Metadata.dll
System.Reflection.Primitives.dll
System.Reflection.TypeExtensions.dll
System.Reflection.dll
System.Resources.Reader.dll
System.Resources.ResourceManager.dll
System.Resources.Writer.dll
System.Runtime.CompilerServices.Unsafe.dll
System.Runtime.CompilerServices.VisualC.dll
System.Runtime.Extensions.dll
System.Runtime.Handles.dll
System.Runtime.InteropServices.JavaScript.dll
System.Runtime.InteropServices.RuntimeInformation.dll
System.Runtime.InteropServices.dll
System.Runtime.Intrinsics.dll
System.Runtime.Loader.dll
System.Runtime.Numerics.dll
System.Runtime.Serialization.Formatters.dll
System.Runtime.Serialization.Json.dll
System.Runtime.Serialization.Primitives.dll
System.Runtime.Serialization.Xml.dll
System.Runtime.Serialization.dll
System.Runtime.dll
System.Security.AccessControl.dll
System.Security.Claims.dll
System.Security.Cryptography.Algorithms.dll
System.Security.Cryptography.Cng.dll
System.Security.Cryptography.Csp.dll
System.Security.Cryptography.Encoding.dll
System.Security.Cryptography.OpenSsl.dll
System.Security.Cryptography.Primitives.dll
System.Security.Cryptography.X509Certificates.dll
System.Security.Cryptography.dll
System.Security.Principal.Windows.dll
System.Security.Principal.dll
System.Security.SecureString.dll
System.Security.dll
System.ServiceModel.Web.dll
System.ServiceProcess.dll
System.Text.Encoding.CodePages.dll
System.Text.Encoding.Extensions.dll
System.Text.Encoding.dll
System.Text.Encodings.Web.dll
System.Text.Json.dll
System.Text.RegularExpressions.dll
System.Threading.AccessControl.dll
System.Threading.Channels.dll
System.Threading.Overlapped.dll
System.Threading.Tasks.Dataflow.dll
System.Threading.Tasks.Extensions.dll
System.Threading.Tasks.Parallel.dll
System.Threading.Tasks.dll
System.Threading.Thread.dll
System.Threading.ThreadPool.dll
System.Threading.Timer.dll
System.Threading.dll
System.Transactions.Local.dll
System.Transactions.dll
System.ValueTuple.dll
System.Web.HttpUtility.dll
System.Web.dll
System.Windows.dll
System.Xml.Linq.dll
System.Xml.ReaderWriter.dll
System.Xml.Serialization.dll
System.Xml.XDocument.dll
System.Xml.XPath.XDocument.dll
System.Xml.XPath.dll
System.Xml.XmlDocument.dll
System.Xml.XmlSerializer.dll
System.Xml.dll
System.dll
Unicode.Bidi.dll
Vulkan/Runtime/HarfBuzz-COPYING.txt
Vulkan/Runtime/MoltenVK-LICENSE.txt
WindowsBase.dll
Yoga.Net.dll
createdump
goo_ship
goo_ship.deps.json
goo_ship.dll
goo_ship.pdb
goo_ship.runtimeconfig.json
libSDL3.so
libSystem.Globalization.Native.so
libSystem.IO.Compression.Native.so
libSystem.Native.so
libSystem.Net.Security.Native.so
libSystem.Security.Cryptography.Native.OpenSsl.so
libclrgc.so
libclrgcexp.so
libclrjit.so
libcoreclr.so
libcoreclrtraceptprovider.so
libgoo-harfbuzz-gpu.so
libgoo-harfbuzz.so
libhostfxr.so
libhostpolicy.so
libmscordaccore.so
libmscordbi.so
mscorlib.dll
netstandard.dll
```

</details>
