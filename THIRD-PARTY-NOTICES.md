# Third-party notices

Goo depends on the third-party software identified below. License links are
pinned to the source revision or release used by Goo.

## Optional AccessKit accessibility runtime

`Goo.Accessibility` redistributes AccessKit C 0.23.0 under MIT OR Apache-2.0.
The companion includes both license texts and `native-build.json` with source,
release archive, and per-platform payload checksums. Linux is rebuilt from the
locked upstream source against Goo's glibc baseline; Windows and macOS use the
upstream release binaries.

- Copyright 2023 The AccessKit Authors. All rights reserved.
- Derived portions: Copyright (c) 2021 Jacob Hoffman-Andrews.
- [AccessKit C release](https://github.com/AccessKit/accesskit-c/releases/tag/0.23.0)
- [MIT license](https://github.com/AccessKit/accesskit-c/blob/0.23.0/LICENSE-MIT)
- [Apache-2.0 license](https://github.com/AccessKit/accesskit-c/blob/0.23.0/LICENSE-APACHE)


Build sources and patch provenance are in `Goo.Accessibility/native-build.json`.

## stb_image decoder

The `goo-harfbuzz-gpu` native library includes `stb_image` 2.30.
Goo selects the MIT license below.

- Copyright (c) 2017 Sean Barrett.

- Source commit: `013ac3beddff3dbffafd5177e7972067cd2b5083`.
- [stb_image source and license](https://github.com/nothings/stb/blob/013ac3beddff3dbffafd5177e7972067cd2b5083/stb_image.h)

## G# runtime support

Goo's Linux bundle redistributes `Gsharp.Extensions.dll` and
`Gsharp.Runtime.Channels.dll` from Gsharp.NET.Sdk 0.5.212.

- Copyright (c) 2019 David Obando.
- License: MIT.
- Package source commit: `242d8777c778db4272103c9dcefd6d63609e10ee`.
- [G# license](https://github.com/DavidObando/gsharp/blob/242d8777c778db4272103c9dcefd6d63609e10ee/LICENSE)

## G# authoring tools

The compiler and canonical formatter come from `Gsharp.NET.Sdk`, declared in
`global.json`. `Goo.Gslint` uses that SDK's parser and formatter assemblies.
Copyright (C) GSharp Authors. All rights reserved.

- [G# license](https://github.com/DavidObando/gsharp/blob/242d8777c778db4272103c9dcefd6d63609e10ee/LICENSE)

## HarfBuzz and hb-gpu text runtime

Goo ships private Linux, Windows, macOS, and Android native payloads built from the
pinned HarfBuzz 15.0.0 upstream archive with `hb-gpu` enabled:
`libgoo-harfbuzz.so` and `libgoo-harfbuzz-gpu.so` on Linux and Android, with
`goo-harfbuzz.dll` and `goo-harfbuzz-gpu.dll` on Windows, and
`libgoo-harfbuzz.dylib` and `libgoo-harfbuzz-gpu.dylib` on macOS. They are
private Goo artifacts, not system-library replacements or a runtime fallback.


- HarfBuzz 15.0.0, including hb-gpu: HarfBuzz Old MIT license.
- Signed tag commit: `35f656a1a2bab548ea7f54a6dd3fba2b09680d14`.
- Source archive SHA-256:
  `968536e9abd782f07f7954044c0c4020199fcdd39b41d221ec42d2a3be4a44df`.
- The selected hb-gpu GLSL inputs and retained `COPYING` text are vendored at
  `tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/`; the native libraries are
  built from the pinned upstream archive above. These GLSL inputs are byte-identical
  in 15.0.0.
- [HarfBuzz 15.0.0 license](https://github.com/harfbuzz/harfbuzz/blob/15.0.0/COPYING)

| Test fixture | Retained notice |
| --- | --- |
| `HarfBuzz-chromacheck-colr.ttf` | `tests/Goo.VulkanProof/Assets/Text/ChromaCheck-MIT.txt` |
| `HarfBuzz-adwaita-colrv1.ttf`, `HarfBuzz-TTC.ttc`, CFF style fixtures | `tests/Goo.VulkanProof/Assets/Text/HarfBuzz-test-fonts-COPYING.txt` |
| `HarfBuzz-cff-f1.otf`, `HarfBuzz-cff-f2.otf`, `HarfBuzz-cff.otc` | `tests/Goo.VulkanProof/Assets/Text/HarfBuzz-aots-COPYING.txt` |

Source paths, hashes and modifications are in the adjacent fixture provenance files.

The hb-gpu GLSL inputs are the pinned HarfBuzz sources
`src/hb-gpu-vertex.glsl`, `src/hb-gpu-fragment.glsl`,
`src/hb-gpu-draw-fragment.glsl`, and `src/hb-gpu-paint-fragment.glsl`.
Goo's Vulkan GLSL compatibility adapters under
`tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/adapters/` and checked-in SPIR-V
under `Goo/Shaders/Vulkan/` are derivative inclusions of
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
Copyright (C) 2026 Behdad Esfahbod
Copyright (C) 2017 Eric Lengyel

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

Goo's Linux SDL 3.4.0 payloads are altered versions.
Build inputs and patches are in `.github/scripts/build-sdl-linux-x64.sh`
and `.github/patches/sdl/`.

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

## Tmds.DBus.Protocol

- Tmds.DBus.Protocol 0.95.2. License: MIT.
- Copyright 2006 Alp Toker <alp@atoker.com>.
- Copyright 2010 Other Contributors.
- Copyright 2016 Tom Deseyn <tom.deseyn@gmail.com>.
- [Pinned license](https://github.com/tmds/Tmds.DBus/blob/5557e043025de2251128ab8048c9d3f0cf50495e/COPYING)

## Unicode 16.0.0 data

Goo includes generated data from the [Unicode 16.0.0 Character Database](https://www.unicode.org/Public/16.0.0/ucd/ReadMe.txt).
The applicable [Unicode License V3](https://www.unicode.org/license.txt) follows.

UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2026 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

## Unicode.Bidi

- Unicode.Bidi 0.4.0: Copyright (c) 2006 Erik A. Brandstadmoen. License: MIT.
- [Unicode.Bidi .NET license](https://github.com/erikbra/unicode-bidi-net/blob/1c245e5be963be3dd6d10257345628102e19ba7f/LICENSE)

Unicode.Bidi ports behavior and generated Unicode data from the Rust
`unicode-bidi` crate version 0.3.18. That upstream work is Copyright The Servo
Project Developers and is offered under either the MIT or Apache-2.0 license.

- [unicode-bidi v0.3.18 MIT license](https://github.com/servo/unicode-bidi/blob/v0.3.18/LICENSE-MIT)
- [unicode-bidi v0.3.18 Apache-2.0 license](https://github.com/servo/unicode-bidi/blob/v0.3.18/LICENSE-APACHE)

## Application fonts

| Font | Version and copyright | License |
| --- | --- | --- |
| Material Symbols Rounded | 2.966, Copyright 2026 Google LLC. The shipped file is a 12-codepoint subset. | Apache-2.0, retained in `apps/Goo.Gallery/Assets/MaterialSymbolsRounded-LICENSE.txt`. [Pinned grant](https://github.com/google/material-design-icons/blob/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/LICENSE). |
| Space Grotesk | 2.000, Copyright 2020 The Space Grotesk Project Authors. Binary blob `a1b2e6c26093066510a31147e7aec9abdc8d6c5e` at [google/fonts commit 2861cb7b](https://github.com/google/fonts/tree/2861cb7b12f90c0a294a12ed666e381e2211872f/ofl/spacegrotesk). | SIL OFL 1.1, retained in `apps/Goo.Gallery/Assets/SpaceGrotesk-OFL.txt`. |
| Vend Sans | Copyright 2025 The Vend Sans Project Authors. | SIL OFL 1.1, retained in `tests/Goo.VulkanProof/Assets/Text/VendSans-OFL.txt`. |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors. | SIL OFL 1.1, retained in `apps/Goo.DevTools/Assets/Fonts/JetBrainsMono-OFL.txt`. |

Each application ships the notices beside its fonts.

## AppImage runtime

AppImage output embeds the type-2 runtime at commit
`fedfad51acc2860b2916a1eef32ba4a500ff31ef`.
Copyright (c) 2004-23 probonopd. License: MIT.
The runtime also includes libfuse 3.15.0 (LGPL-2.1), squashfuse 0.5.2
(BSD-2-Clause), and Alpine 3.21 packages musl (MIT), zstd (BSD-3-Clause)
and zlib (Zlib).
The runtime and dependency notices are retained in
`tools/Goo.DevTools.Cli/Packaging/AppImage-Runtime-LICENSE.txt` and copied to AppImage output.

## Goo Gallery shader algorithm sources

The Goo Gallery application under `apps/Goo.Gallery` ports only the required
algorithms identified below into Slang fragment effects. No sample textures or
unrelated source from these projects is included.

| Source | Attribution and license | Gallery use |
| --- | --- | --- |
| [raycastergl](https://github.com/melchor629/raycastergl/blob/8f21b5fc984681e01c1865fb44c8db6d79f58634/LICENSE) | Copyright (c) 2020 Melchor Garau Madrigal. MIT. | Grid DDA traversal and perpendicular wall distance in `wolfenstein.frag.slang`. |
| [RayMarch](https://github.com/shaunramsey/RayMarch/blob/34a9b32424b535b5993c9dd454af9f9cf802d318/LICENSE) | Copyright (c) 2025 Shaun Ramsey. MIT. | Signed-distance primitives, sphere tracing and normals in `chrome_sdf.frag.slang` and `corridor.frag.slang`. |
| [webgl-noise](https://github.com/ashima/webgl-noise/blob/6abed1e77ed1e18b181627c35f688eb30c9fe75e/LICENSE) | Copyright (c) 2011 Ashima Arts. All rights reserved. Copyright (c) 2011-2016 Stefan Gustavson. MIT. | Textureless 3D simplex noise in `volumetric.frag.slang`. |
| [Return-of-the-One-Bit](https://github.com/yunjay/Return-of-the-One-Bit/blob/5ba093eefd1761d12a9f8c54d612466e0cb71497/LICENSE) | Copyright (c) 2022 Yun Jay Kim. MIT. | Bayer and halftone matrices in `dither.frag.slang`. |

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
