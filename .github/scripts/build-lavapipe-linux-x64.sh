#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: build-lavapipe-linux-x64.sh OUTPUT_DIRECTORY [--inside]}"
image=ubuntu:22.04@sha256:45e9ddc6895604674618a409ca9f73d301da8fdb75fe330e8e9a27b3b219e4ad
if [[ ${2:-} != --inside ]]; then
  mkdir -p "$output"
  output="$(realpath "$output")"
  rm -rf -- "$output/native" "$output/licenses" "$output/provenance.json"
  work="$(mktemp -d "$(dirname "$output")/lavapipe-build.XXXXXX")"
  trap 'rm -rf -- "$work"' EXIT
  "${CONTAINER_ENGINE:-docker}" run --rm --cpus=4 --memory=8g \
    -v "$(realpath "$0"):/build-lavapipe.sh:ro" -v "$output:/out" -v "$work:/build" \
    "$image" bash /build-lavapipe.sh /out --inside
  exit
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates
printf 'deb http://snapshot.ubuntu.com/ubuntu/20261115T000000Z jammy main universe\ndeb http://snapshot.ubuntu.com/ubuntu/20261115T000000Z jammy-updates main universe\ndeb http://snapshot.ubuntu.com/ubuntu/20261115T000000Z jammy-security main universe\n' > /etc/apt/sources.list
apt-get -o Acquire::Check-Valid-Until=false update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  binutils ca-certificates cmake curl g++ libdrm-dev libffi-dev libtinfo-dev libwayland-dev \
  libxml2-dev ninja-build patchelf pkg-config python3-pip python3-ply python3-yaml xz-utils zlib1g-dev
cd /build
curl -fLsS --retry 5 https://archive.ubuntu.com/ubuntu/pool/universe/l/llvm-toolchain-14/llvm-14-dev_14.0.0-1ubuntu1.1_amd64.deb -o llvm.deb
printf '%s  llvm.deb\n' 1819b6ee60e43f3897cf5e41843d7acf2343627f423399aa0ac9b0e4efa51e70 | sha256sum -c -
curl -fLsS --retry 5 https://archive.ubuntu.com/ubuntu/pool/universe/l/llvm-toolchain-14/libclang-common-14-dev_14.0.0-1ubuntu1.1_amd64.deb -o clang-common.deb
printf '%s  clang-common.deb\n' a190eb2456b0cd398f04423eee53140d65f5f90d2353ad957e7e5884276d90b9 | sha256sum -c -
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ./llvm.deb ./clang-common.deb
pip3 install --no-cache-dir meson==1.7.2 Mako==1.3.9 packaging==24.2

fetch() {
  curl -fLsS --retry 5 "$2" -o "$1"
  printf '%s  %s\n' "$3" "$1" | sha256sum -c -
  mkdir "$4"
  tar -xf "$1" -C "$4" --strip-components=1 --no-same-owner
}
fetch mesa.tar.xz https://archive.mesa3d.org/mesa-26.2.6.tar.xz b9436b3e1a8be76fbd4823dc884f90596ab7c6ac5e1867a305e66ffccfb31a92 mesa
fetch protocols.tar.xz https://gitlab.freedesktop.org/wayland/wayland-protocols/-/releases/1.41/downloads/wayland-protocols-1.41.tar.xz 2786b6b1b79965e313f2c289c12075b9ed700d41844810c51afda10ee329576b protocols
fetch loader.tar.gz https://codeload.github.com/KhronosGroup/Vulkan-Loader/tar.gz/refs/tags/v1.3.296 682d5323cf31308402c888599b375ebf15810f95d6d1a08ad2f525766becf99b loader
fetch headers.tar.gz https://codeload.github.com/KhronosGroup/Vulkan-Headers/tar.gz/refs/tags/v1.3.296 e204e0b3c19f622d197df945737f5db913d6621830999b8578d34e80a7c90585 headers
fetch glslang.tar.gz https://codeload.github.com/KhronosGroup/glslang/tar.gz/refs/tags/12.3.1 a57836a583b3044087ac51bb0d5d2d803ff84591d55f89087fc29ace42a8b9a8 glslang
export SOURCE_DATE_EPOCH=1793145600
cmake -S glslang -B glslang-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DENABLE_OPT=OFF -DBUILD_EXTERNAL=OFF -DENABLE_HLSL=OFF -DENABLE_CTEST=OFF
cmake --build glslang-build --target glslang-standalone -j4
export PATH=/build/glslang-build/StandAlone:$PATH
meson setup protocols-build protocols --prefix=/build/install -Dtests=false
ninja -C protocols-build install
export PKG_CONFIG_PATH=/build/install/share/pkgconfig
export LLVM_CONFIG=/usr/bin/llvm-config-14
meson setup mesa-build mesa --prefix=/build/install --buildtype=release --wrap-mode=nofallback \
  -Dplatforms=wayland -Dvulkan-drivers=swrast -Dgallium-drivers=[] \
  -Dllvm=enabled -Dshared-llvm=disabled -Dllvm-orcjit=false \
  -Dopengl=false -Dgles1=disabled -Dgles2=disabled -Degl=disabled -Dglx=disabled -Dgbm=disabled \
  -Dvideo-codecs=[] -Dgallium-va=disabled \
  -Dzlib=disabled -Dzstd=disabled -Dexpat=disabled -Dxmlconfig=disabled \
  -Dshader-cache=disabled -Dbuild-tests=false "-Dcpp_link_args=['-static-libstdc++','-static-libgcc']"
ninja -C mesa-build -j4 src/gallium/targets/lavapipe/libvulkan_lvp.so
cmake -S headers -B headers-build -G Ninja -DCMAKE_INSTALL_PREFIX=/build/install -DVULKAN_HEADERS_ENABLE_TESTS=OFF
cmake --install headers-build
cmake -S loader -B loader-build -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH=/build/install -DBUILD_TESTS=OFF -DBUILD_WSI_XCB_SUPPORT=OFF \
  -DBUILD_WSI_XLIB_SUPPORT=OFF -DBUILD_WSI_WAYLAND_SUPPORT=ON
cmake --build loader-build -j4
mkdir -p "$output/native" "$output/licenses"
install -m644 mesa-build/src/gallium/targets/lavapipe/libvulkan_lvp.so "$output/native/"
install -m644 loader-build/loader/libvulkan.so.1.3.296 "$output/native/libgoo-vulkan.so.1"
cp loader/LICENSE.txt "$output/licenses/Vulkan-Loader-LICENSE.txt"
cp /usr/share/doc/llvm-14/copyright "$output/licenses/LLVM-copyright.txt"
cp /usr/share/doc/gcc-11-base/copyright "$output/licenses/GCC-copyright.txt"
cp /usr/share/common-licenses/GPL-3 "$output/licenses/GPL-3.0.txt"
python3 - "$output" <<'PY'
import hashlib, json, pathlib, re, shutil, subprocess, sys
out = pathlib.Path(sys.argv[1])
for license in pathlib.Path('mesa/licenses').rglob('*'):
    if license.is_file():
        name = '-'.join(license.relative_to('mesa/licenses').parts)
        shutil.copyfile(license, out / 'licenses' / name)
base = {'libc.so.6', 'libm.so.6', 'libdl.so.2', 'libpthread.so.0', 'librt.so.1', 'ld-linux-x86-64.so.2'}
queue = list((out / 'native').iterdir())
seen = set()
while queue:
    library = queue.pop()
    if library.name in seen:
        continue
    seen.add(library.name)
    for name, path in re.findall(r'\s*(\S+) => (/\S+) ', subprocess.check_output(['ldd', str(library)], text=True)):
        if name in base or (out / 'native' / name).exists():
            continue
        target = out / 'native' / name
        shutil.copyfile(path, target)
        queue.append(target)
        owner = subprocess.check_output(['dpkg-query', '-S', '*/' + pathlib.Path(path).name], text=True).split(':')[0]
        license = pathlib.Path('/usr/share/doc') / owner / 'copyright'
        shutil.copyfile(license, out / 'licenses' / (owner + '-copyright.txt'))
artifacts = {}
for path in sorted((out / 'native').iterdir()):
    subprocess.check_call(['patchelf', '--set-rpath', '$ORIGIN', str(path)])
    subprocess.check_call(['strip', '--strip-unneeded', str(path)])
    versions = re.findall(r'GLIBC_(\d+)\.(\d+)', subprocess.check_output(['readelf', '--version-info', str(path)], text=True))
    maximum = max((tuple(map(int, version)) for version in versions), default=(0, 0))
    if maximum > (2, 35):
        raise SystemExit(f'{path.name} requires GLIBC_{maximum}')
    needed = re.findall(r'Shared library: \[(.*?)\]', subprocess.check_output(['readelf', '-d', str(path)], text=True))
    if any(name not in base and not (out / 'native' / name).exists() for name in needed):
        raise SystemExit(f'Unbundled dependency: {path.name}: {needed}')
    artifacts[path.name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size, 'needed': needed, 'glibc': '.'.join(map(str, maximum))}
(out / 'provenance.json').write_text(json.dumps({'mesa': '26.2.6', 'mesaSha256': 'b9436b3e1a8be76fbd4823dc884f90596ab7c6ac5e1867a305e66ffccfb31a92', 'llvm': '14.0.0-1ubuntu1.1', 'loader': '1.3.296', 'rid': 'linux-x64', 'artifacts': artifacts}, indent=2) + '\n')
print(json.dumps(artifacts, indent=2))
PY
