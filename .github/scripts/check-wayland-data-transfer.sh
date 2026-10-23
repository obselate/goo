#!/usr/bin/env bash
set -euo pipefail

sdl_source="${1:?usage: check-wayland-data-transfer.sh SDL_SOURCE NATIVE_DIRECTORY}"
native="${2:?usage: check-wayland-data-transfer.sh SDL_SOURCE NATIVE_DIRECTORY}"
root="$(realpath "$(dirname "$0")/../..")"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
pkg-config --atleast-version=1.4 libei-1.0
pkg-config --exists gio-unix-2.0 wayland-client
install -m755 "$native/libSDL3.so" "$work/libSDL3.so.0"
ln -s libSDL3.so.0 "$work/libSDL3.so"
read -r -a input_flags <<< "$(pkg-config --cflags --libs libei-1.0 gio-unix-2.0)"
read -r -a wayland_flags <<< "$(pkg-config --cflags --libs wayland-client)"
nice -n 10 "${CC:-cc}" -Wall -Wextra -Werror \
  "$root/tests/NativeWindow/wayland_input.c" -o "$work/input" "${input_flags[@]}"
nice -n 10 "${CC:-cc}" -Wall -Wextra -Werror -Wno-unused-parameter \
  -I"$sdl_source/include" "$root/tests/NativeWindow/data_transfer_peer.c" \
  "$work/libSDL3.so.0" -Wl,-rpath,"$work" -o "$work/peer" "${wayland_flags[@]}"
nice -n 10 dotnet build "$root/tests/Goo.ApiContractTests/Goo.ApiContractTests.csproj" \
  -c Release --nologo -m:4 -warnaserror
output="$root/tests/Goo.ApiContractTests/bin/Release/net10.0"
for library in libSDL3.so libgoo-harfbuzz.so libgoo-harfbuzz-gpu.so; do
  install -m755 "$native/$library" "$output/$library"
done
GOO_HEADLESS_COMPOSITOR=kwin GOO_NATIVE_TRANSFER_INPUT="$work/input" \
  GOO_NATIVE_TRANSFER_PEER="$work/peer" \
  nice -n 10 "$root/.github/scripts/with-headless-wayland.sh" \
  dotnet test "$root/tests/Goo.ApiContractTests/Goo.ApiContractTests.csproj" \
  -c Release --no-build --nologo -m:4 \
  --filter FullyQualifiedName~NativeMimeBytesAndNegotiatedEffectsSurviveCrossProcessHandoff
