# Third-party notices

Goo depends on the third-party software identified below. License links are
pinned to the source revision or release used by Goo.

## StbImageSharp PNG decoder

Goo depends on the managed `StbImageSharp` 2.30.16 package. No additional native
image-decoder library is required. The package declares `Unlicense OR MIT`.

- Package repository commit: `125af70cb557033f2c46aec8e82eaaf72ac49817`.
- [StbImageSharp source and license](https://github.com/StbSharp/StbImageSharp/blob/125af70cb557033f2c46aec8e82eaaf72ac49817/README.md)

## G# runtime support

Goo's Linux bundle redistributes `Gsharp.Extensions.dll` from
Gsharp.NET.Sdk 0.4.1.

- Copyright (c) 2019 David Obando.
- License: MIT.
- Release commit: `d670ac98c03e0b0f7c9ac965f5fa3914712f09de`.
- [G# license](https://github.com/DavidObando/gsharp/blob/d670ac98c03e0b0f7c9ac965f5fa3914712f09de/LICENSE)

## G# formatting engine

`tools/Goo.Gslint/FormattingEngine.cs` is derived from G#'s MIT-licensed
formatting engine at commit `41d5ccbafcc40b8babdbdc0ab9add728a4b1eb02`.
Goo changes the namespace, removes source comments, and fixes canonical line
endings to LF. Copyright (C) GSharp Authors. All rights reserved.

- [G# formatting engine source](https://github.com/DavidObando/gsharp/blob/41d5ccbafcc40b8babdbdc0ab9add728a4b1eb02/src/LanguageServer/FormattingEngine.cs)
- [G# license](https://github.com/DavidObando/gsharp/blob/41d5ccbafcc40b8babdbdc0ab9add728a4b1eb02/LICENSE)

## HarfBuzz and hb-gpu text runtime

Goo ships private Linux, Windows, macOS, and Android native payloads built from the
pinned HarfBuzz 14.3.1 upstream archive with `hb-gpu` enabled:
`libgoo-harfbuzz.so` and `libgoo-harfbuzz-gpu.so` on Linux and Android, with
`goo-harfbuzz.dll` and `goo-harfbuzz-gpu.dll` on Windows, and
`libgoo-harfbuzz.dylib` and `libgoo-harfbuzz-gpu.dylib` on macOS. They are
private Goo artifacts, not system-library replacements or a runtime fallback.

- HarfBuzz 14.3.1, including hb-gpu: HarfBuzz Old MIT license.
- Signed tag commit: `ab5ecbb83985034a76214ac0b2b833dcd590d774`.
- Source archive SHA-256:
  `9dae9538aae2ffdf70cec31f2c27bf68e2aaeeae3112688467697d5faf6194f7`.
- Goo applies the checked-in
  `tools/Goo.TextNative/patches/harfbuzz-14.3.1-cpal-linear-light.patch`
  with SHA-256
  `225d5b7e5a656e96ee850f41c662e625d9c29ac518c1b834b3c53b7949358b67`.
  It patches `src/hb-gpu-paint.cc` at upstream SHA-256
  `78c12e63968ae3de1d56cc6bc788930f8474bd0e34beed66ca24375ad137a463`
  to encode explicit CPAL RGB bytes as linear-light Q15 through a fixed
  256-entry lookup. Alpha and foreground color semantics remain unchanged.
- The selected hb-gpu GLSL inputs and retained `COPYING` text are vendored at
  `tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/`; the native libraries are
  built from the pinned upstream archive above.
- [HarfBuzz 14.3.1 license](https://github.com/harfbuzz/harfbuzz/blob/14.3.1/COPYING)

The proof's deterministic color-font fixtures originate from the same pinned
HarfBuzz test archive. `HarfBuzz-chromacheck-colr.ttf` is covered by the
ChromaCheck MIT notice in `tests/Goo.VulkanProof/Assets/Text/ChromaCheck-MIT.txt`.
`HarfBuzz-adwaita-colrv1.ttf` is derived from the exact upstream fixture by
changing only its CPAL table from version 0 to version 1 with palette type 1.
It is covered by the HarfBuzz test-font OFL notice in
`tests/Goo.VulkanProof/Assets/Text/HarfBuzz-test-fonts-COPYING.txt`.
The `HarfBuzz-TTC.ttc` collection fixture is covered by that same OFL 1.1
notice. Its two-face source path, SHA-256, and license mapping are recorded in
`tests/Goo.VulkanProof/Assets/Text/HarfBuzz-TTC.provenance.json`. Each fixture
has a SHA-256 and source record beside it.

The CFF corpus fixtures `HarfBuzz-cff-f1.otf` and `HarfBuzz-cff-f2.otf` are
copied from the pinned HarfBuzz AOTS shape corpus and carry its Apache License
2.0 notice at `tests/Goo.VulkanProof/Assets/Text/HarfBuzz-aots-COPYING.txt`.
`HarfBuzz-cff.otc` is a deterministic two-face collection generated from those
two exact inputs. The source paths, hashes, face order, and generation record
are retained in the matching `HarfBuzz-cff-*.provenance.json` files.

The registered-font corpus also carries three tiny CFF OpenType style fixtures
from the pinned HarfBuzz API test corpus: `cv01.otf`, `cff1_seac.otf`, and
`SourceHanSans-Regular.41,3041,4C2E.otf`. They are covered by the HarfBuzz test
font SIL Open Font License 1.1 notice retained at
`tests/Goo.VulkanProof/Assets/Text/HarfBuzz-test-fonts-COPYING.txt`. Their
source paths, fixture hashes, CFF format, and measured `U+0041` advance widths
are recorded in the matching `HarfBuzz-cff-style-*.provenance.json` files.

The hb-gpu GLSL inputs are the pinned HarfBuzz sources
`src/hb-gpu-vertex.glsl`, `src/hb-gpu-fragment.glsl`,
`src/hb-gpu-draw-fragment.glsl`, and `src/hb-gpu-paint-fragment.glsl`.
Goo's Vulkan GLSL compatibility adapters under
`tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/` and checked-in SPIR-V
under `tests/Goo.VulkanProof/Generated/Shaders/` are derivative inclusions of
those sources and retain the same attribution and license terms.

## Yoga.Net 3.2.3, based on Meta Yoga v3.2.1

Goo ships one vendored C# Yoga implementation. `3.2.3` is the Yoga.Net port
version. `v3.2.1` is the Meta Yoga source and behavior baseline for that port.

- Yoga.Net port: Copyright (c) 2026 Chen Ren Song.
- Vendored Yoga.Net license: Copyright (c) Meta Platforms, Inc. and its affiliates.
- Meta Yoga v3.2.1 license: Copyright (c) Facebook, Inc. and its affiliates.
- License: MIT.
- [Vendored Yoga.Net license](https://github.com/chenrensong/Yoga.Net/blob/baf14fcd6cbf21d8930a297e32ef3b76674c37bd/LICENSE)
- [Meta Yoga v3.2.1 license](https://github.com/facebook/yoga/blob/v3.2.1/LICENSE)
- Vendored revision: `baf14fcd6cbf21d8930a297e32ef3b76674c37bd`.
- Goo carries local performance patches. Those changes are Goo modifications,
  not an upstream Yoga.Net release.

## HarfBuzz Old MIT license

HarfBuzz is licensed under the so-called "Old MIT" license. Details follow.
For parts of HarfBuzz that are licensed under different licenses see individual
files named COPYING in subdirectories where applicable.

Copyright (c) 2010-2022 Google, Inc.
Copyright (c) 2015-2020 Ebrahim Byagowi
Copyright (c) 2019,2020 Facebook, Inc.
Copyright (c) 2012,2015 Mozilla Foundation
Copyright (c) 2011 Codethink Limited
Copyright (c) 2008,2010 Nokia Corporation and/or its subsidiary(-ies)
Copyright (c) 2009 Keith Stribley
Copyright (c) 2011 Martin Hosken and SIL International
Copyright (c) 2007 Chris Wilson
Copyright (c) 2005,2006,2020,2021,2022,2023 Behdad Esfahbod
Copyright (c) 2004,2007,2008,2009,2010,2013,2021,2022,2023 Red Hat, Inc.
Copyright (c) 1998-2005 David Turner and Werner Lemberg
Copyright (c) 2016 Igalia S.L.
Copyright (c) 2022 Matthias Clasen
Copyright (c) 2018,2021 Khaled Hosny
Copyright (c) 2018,2019,2020 Adobe, Inc.
Copyright (c) 2013-2015 Alexei Podtelezhnikov

For full copyright notices consult the individual files in the package.

Permission is hereby granted, without written agreement and without license or
royalty fees, to use, copy, modify, and distribute this software and its
documentation for any purpose, provided that the above copyright notice and
the following two paragraphs appear in all copies of this software.

IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE TO ANY PARTY FOR DIRECT,
INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE
OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF THE COPYRIGHT HOLDER HAS BEEN
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

THE COPYRIGHT HOLDER SPECIFICALLY DISCLAIMS ANY WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE. THE SOFTWARE PROVIDED HEREUNDER IS ON AN "AS IS" BASIS, AND
THE COPYRIGHT HOLDER HAS NO OBLIGATION TO PROVIDE MAINTENANCE, SUPPORT, UPDATES,
ENHANCEMENTS, OR MODIFICATIONS.

## Hexa.NET.SDL3, HexaGen.Runtime, and SDL

- Hexa.NET.SDL3 1.2.17: Copyright (c) 2024 Juna Meinhold. License: MIT.
- HexaGen.Runtime 1.1.24: Copyright (c) 2023 Juna Meinhold. License: MIT.
- SDL 3.4.0: Copyright (C) 1997-2025 Sam Lantinga. License: zlib.
- [Hexa.NET.SDL3 license](https://github.com/HexaEngine/Hexa.NET.SDL/blob/15fc3406e473759a2bcddd9c3ea24b8006916fbd/LICENSE.txt)
- [HexaGen.Runtime license](https://github.com/HexaEngine/HexaGen/blob/e8cde045ae0b15284cddd8f79b491af4a8afc420/LICENSE.txt)
- [SDL 3.4.0 license](https://github.com/libsdl-org/SDL/blob/release-3.4.0/LICENSE.txt)

Hexa.NET.SDL3 distributes SDL native binaries, but its package license covers
the MIT-licensed wrapper. Goo therefore reproduces SDL's zlib notice directly.

### SDL zlib license

Copyright (C) 1997-2025 Sam Lantinga <slouken@libsdl.org>

This software is provided 'as-is', without any express or implied warranty. In
no event will the authors be held liable for any damages arising from the use
of this software.

Permission is granted to anyone to use this software for any purpose, including
commercial applications, and to alter it and redistribute it freely, subject
to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim
   that you wrote the original software. If you use this software in a product,
   an acknowledgment in the product documentation would be appreciated but is
   not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.

## MoltenVK

Goo's macOS arm64 runtime ships MoltenVK 1.4.2 as `libMoltenVK.dylib` from the
official non-private-API macOS release archive.

- License: Apache License 2.0.
- Release archive SHA-256:
  `f95765a6229cb7b915990a2890ce12ebe36a730b021545d3d52ae69ce4c4024e`.
- [MoltenVK 1.4.2 license](https://github.com/KhronosGroup/MoltenVK/blob/v1.4.2/LICENSE)
- The complete license text is retained in
  `Goo/Runtime/Vulkan/MoltenVK-LICENSE.txt` and shipped with Goo.

## Unicode.Bidi

- Unicode.Bidi 0.3.18: Copyright (c) 2006 Erik A. Brandstadmoen. License: MIT.
- [Unicode.Bidi .NET license](https://github.com/erikbra/unicode-bidi-net/blob/14fc0a5d273d2ffdc59dc3e6b2828847dbd1cda9/LICENSE)

Unicode.Bidi ports behavior and generated Unicode data from the Rust
`unicode-bidi` crate version 0.3.18. That upstream work is Copyright The Servo
Project Developers and is offered under either the MIT or Apache-2.0 license.

- [unicode-bidi v0.3.18 MIT license](https://github.com/servo/unicode-bidi/blob/v0.3.18/LICENSE-MIT)
- [unicode-bidi v0.3.18 Apache-2.0 license](https://github.com/servo/unicode-bidi/blob/v0.3.18/LICENSE-APACHE)

## Goo Gallery shader algorithm sources

The Goo Gallery application under `apps/Goo.Gallery` ports only the required
algorithms identified below into Slang fragment effects. No sample textures or
unrelated source from these projects is included.

- raycastergl: Copyright (c) 2020 Melchor Garau Madrigal. License: MIT.
  Ported the grid DDA traversal and perpendicular wall distance calculation
  into `apps/Goo.Gallery/Shaders/wolfenstein.frag.slang`.
  [raycastergl license](https://github.com/melchor629/raycastergl/blob/8f21b5fc984681e01c1865fb44c8db6d79f58634/LICENSE)
  at commit `8f21b5fc984681e01c1865fb44c8db6d79f58634`
  (source file `raycastergl/res/shaders/raycaster.glsl`).
- RayMarch: Copyright (c) 2025 Shaun Ramsey. License: MIT.
  Ported the signed-distance primitives, sphere-tracing loop, and
  finite-difference normal estimation into
  `apps/Goo.Gallery/Shaders/chrome_sdf.frag.slang` and
  `apps/Goo.Gallery/Shaders/corridor.frag.slang`.
  [RayMarch license](https://github.com/shaunramsey/RayMarch/blob/34a9b32424b535b5993c9dd454af9f9cf802d318/LICENSE)
  at commit `34a9b32424b535b5993c9dd454af9f9cf802d318`
  (source file `fifthlighting.frag`).
- webgl-noise: Copyright (c) 2011 Ashima Arts. All rights reserved.
  Copyright (c) 2011-2016 Stefan Gustavson. License: MIT.
  Ported the textureless 3D simplex noise function `snoise` and its
  helper routines into `apps/Goo.Gallery/Shaders/volumetric.frag.slang`.
  [webgl-noise license](https://github.com/ashima/webgl-noise/blob/6abed1e77ed1e18b181627c35f688eb30c9fe75e/LICENSE)
  at commit `6abed1e77ed1e18b181627c35f688eb30c9fe75e`
  (source file `src/noise3D.glsl`).
- Return-of-the-One-Bit: Copyright (c) 2022 Yun Jay Kim. License: MIT.
  Ported the 4x4 and 8x8 Bayer matrices, the halftone matrix, and the
  ordered threshold comparison logic into
  `apps/Goo.Gallery/Shaders/dither.frag.slang`.
  [Return-of-the-One-Bit license](https://github.com/yunjay/Return-of-the-One-Bit/blob/5ba093eefd1761d12a9f8c54d612466e0cb71497/LICENSE)
  at commit `5ba093eefd1761d12a9f8c54d612466e0cb71497`
  (source files `shaders/bayer16.fs`, `shaders/bayer64.fs`, and
  `shaders/halftone.fs`).

## MIT license text

The following terms apply to the MIT-licensed components identified above,
with their respective copyright notices.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
