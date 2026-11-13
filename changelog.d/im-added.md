## Added

- Add `AsyncImageSource` with a Task-returning loader. Keep the source in a field or model. Loads share their result. Releasing the last pending lease cancels its token. Failed loads retry on the next acquire. Goo updates the image on its UI thread without an app rebuild call.
- Add `Image.Placeholder` and `Image.Fallback`. Their content fills and clips to the image box without changing its measured size.
- Add `Assets.Open(assembly, name)` and `Assets.ReadAllBytes(assembly, name)`. Exact manifest resource names take priority over files beside the application.
- Add `GooAsset` build items. Files copy to output for normal builds and embed for single-file or NativeAOT builds. Add `Embed="true"` to `GooShaderEffect` to embed its compiled program. Load it with `ShaderEffectProgram.Load(assembly, name)` without the `.goo-effect` extension.
