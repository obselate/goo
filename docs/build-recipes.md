# Assets, Watch items and embedded shaders

Verified on 2026-10-16 with Gsharp.NET.Sdk 0.4.1150, Goo 0.7.35,
Slang 2026.16 and SPIRV-Tools 2026.3 from Vulkan SDK 1.4.357.0.
These are optional feature recipes, not requirements for the template's first window.

## Copy files next to the app

Several consumers copy image and font files into both build and publish output.
Use ordinary MSBuild content items. Add this to the project `ItemGroup`:

```xml
<Content Include="Assets/**/*" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />
```

Resolve a copied SVG through the executable directory:

```gsharp
import Goo
import Goo.Svg
import System
import System.IO

let icon = Svg.Load(Path.Combine(AppContext.BaseDirectory, "Assets", "icon.svg"))
```

Retain the asset outside `Build`. The [shipping guide](shipping.md) runs this
recipe from a different working directory and lists the published asset.
Use the same content pattern for licensed TTF/OTF files and their license files.
Copying a font does not register it. Use the [font API](api/text.md) and retain
and dispose the app-owned registration as required by that API.
For raster images, see [image loading](images.md).

Embedding is a separate choice: `EmbeddedResource` does not create a base-directory
file. Open it through the assembly's manifest resource API. The shader recipe
below demonstrates that route with a generated binary asset.

## Declare watched inputs

Consumers such as gpi, tokate-gui and Hivemind scratch explicitly declare G# inputs.
The generated template does not include this declaration:

```xml
<ItemGroup>
  <Watch Include="**/*.gs" Exclude="bin/**;obj/**" />
  <Watch Include="Assets/**/*;Shaders/**/*.slang" />
</ItemGroup>
```

The second declaration is optional. Include only directories the app uses.
Do not watch generated output or publish directories. `Watch` registers inputs,
not content-copy behavior or a guarantee that every edit is hot-reloadable.
Copied assets and shader changes can require a restart or an explicit app reload.

Inspect the evaluated declaration from the app directory:

```sh
dotnet msbuild -getItem:Watch -m:2 -nodeReuse:false -p:UseSharedCompilation=false
```

The executed sample listed `Program.gs`, `Assets/icon.svg` and `Shaders/tint.slang`,
with no files from `bin` or `obj`. This verifies input registration, not state
preservation during a live edit. Use the [DevTools guide](devtools/README.md) for
launching and inspection.

## Embed compiled ShaderEffect programs

The gpi consumer embeds generated programs with a target that depends on
`GooCompileShaderEffects` and runs before `AssignTargetPaths`. The generic recipe
below keeps that ordering. It uses Goo's current private `_GooShaderEffect`
metadata, not a stable public MSBuild interface. Recheck it when upgrading Goo.

First install the [pinned shader tools](../README.md#custom-shaders). Check versions:

```sh
slangc -version
spirv-val --version
```

Expected: `2026.16` and `SPIRV-Tools v2026.3 vulkan-sdk-1.4.357.0` respectively.
Both were observed. Goo accepts the tools on `PATH`, or through `SLANG_SDK` and
`VULKAN_SDK`. No runtime compiler is needed on the user's machine.

Create `Shaders/tint.slang`:

```slang
#include "goo_effect.slang"

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    return source * gooParameter(0);
}
```

Add the item and target inside the project:

```xml
<ItemGroup>
  <GooShaderEffect Include="Shaders/tint.slang" />
</ItemGroup>
<Target Name="EmbedGooShaderEffects" BeforeTargets="AssignTargetPaths" DependsOnTargets="GooCompileShaderEffects">
  <ItemGroup>
    <EmbeddedResource Include="%(_GooShaderEffect.ProgramPath)" LogicalName="App.Shaders.%(_GooShaderEffect.Filename)" />
  </ItemGroup>
</Target>
```

Use distinct filenames to avoid resource-name collisions. Goo still copies the
compiled program and provenance manifest to the output. This target adds an
embedded copy. It does not remove sidecars or discard build provenance.

In the shipping sample, add this at the start of `Main` to check resource loading:

```gsharp
using let stream = typeof(Counter).Assembly.GetManifestResourceStream("App.Shaders.tint")
if stream == nil { throw FileNotFoundException("Embedded shader is missing") }
using let output = MemoryStream()
stream.CopyTo(output)
let program = ShaderEffectProgram(output.ToArray())
Console.WriteLine("Loaded embedded shader")
```

The existing `System` and `System.IO` imports are required. Construct and retain a
`ShaderEffect` from `program`, then set parameter slot zero before assigning it to
an element. See the [ShaderEffect API](api/rendering.md#apply-fragment-shaders-to-retained-elements)
for parameter, ownership and rendering contracts. This recipe checks embedding
and parsing, not the visual effect.

```sh
dotnet build -c Release -p:TreatWarningsAsErrors=true -m:2 -nodeReuse:false -p:UseSharedCompilation=false
timeout 8s dotnet run -c Release --no-build
```

Observed build: `Compiled .../Shaders/tint.slang as goo-shader-effect-2`, then
`Build succeeded`, zero warnings and errors. Startup printed
`Loaded embedded shader`. The watchdog ended the app with exit 124.
The generated `.goo-effect` and `.goo-effect.json` sidecars were also present.
