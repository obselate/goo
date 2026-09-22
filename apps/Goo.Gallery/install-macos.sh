#!/usr/bin/env bash
set -euo pipefail

download_base="${GOO_GALLERY_DOWNLOAD_BASE:-https://github.com/obselate/goo/releases/latest/download}"
archive_name="Goo.Gallery-macos-arm64.tar.gz"
checksum_name="$archive_name.sha256"
install_root="${GOO_GALLERY_INSTALL_ROOT:-$HOME/Applications}"
install_path="$install_root/Goo Gallery.app"
work="$(mktemp -d "${TMPDIR:-/tmp}/goo-gallery.XXXXXX")"

cleanup() {
  rm -rf "$work"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Goo Gallery requires macOS." >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "This build requires an Apple Silicon Mac." >&2
  exit 1
fi

curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  "$download_base/$archive_name" -o "$work/$archive_name"
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  "$download_base/$checksum_name" -o "$work/$checksum_name"

(
  cd "$work"
  shasum -a 256 -c "$checksum_name"
  tar -xzf "$archive_name"
)

source_path="$work/Goo Gallery.app"
test -x "$source_path/Contents/MacOS/Goo.Gallery"
test -f "$source_path/Contents/MacOS/libMoltenVK.dylib"
test -f "$source_path/Contents/MacOS/libSDL3.dylib"

mkdir -p "$install_root"
if [[ -e "$install_path" ]]; then
  trash_root="$HOME/.Trash"
  mkdir -p "$trash_root"
  old_path="$trash_root/Goo Gallery $(date +%Y%m%d-%H%M%S)-$$.app"
  mv "$install_path" "$old_path"
  echo "Previous Goo Gallery moved to $old_path"
fi

ditto "$source_path" "$install_path"
xattr -dr com.apple.quarantine "$install_path"
open "$install_path"
echo "Goo Gallery installed at $install_path"
