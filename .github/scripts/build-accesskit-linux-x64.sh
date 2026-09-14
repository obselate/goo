#!/usr/bin/env bash
# Reproduce the optional AccessKit Linux payload on Goo's glibc 2.27 baseline.
set -euo pipefail
accesskit_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
accesskit_work="$accesskit_root/artifacts/accesskit-build"
mkdir -p "$accesskit_work"
curl --fail --location --silent --show-error https://github.com/AccessKit/accesskit-c/archive/refs/tags/0.23.0.tar.gz -o "$accesskit_work/source.tar.gz"
printf '%s  %s\n' ee989c2b98bdd201ce026237214c98c39b2f6e40182b6df311a193780e63d075 "$accesskit_work/source.tar.gz" | sha256sum --check
mkdir -p "$accesskit_work/output"
cp "$accesskit_root/.github/patches/accesskit/atspi-cache-signal-arguments.patch" "$accesskit_work/atspi-cache-signal-arguments.patch"
docker run --rm --name goo-accesskit-build --mount "type=bind,src=$accesskit_work,dst=/input,readonly" --mount "type=bind,src=$accesskit_work/output,dst=/output" ubuntu:18.04@sha256:dca176c9663a7ba4c1f0e710986f5a25e672842963d95b960191e2d9f7185ebe bash -c '
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends build-essential curl ca-certificates pkg-config
curl --proto "=https" --tlsv1.2 -fsS https://sh.rustup.rs -o /tmp/rustup.sh
sh /tmp/rustup.sh -y --profile minimal --default-toolchain 1.98.0
export PATH="/root/.cargo/bin:$PATH"
mkdir /build
tar -xzf /input/source.tar.gz -C /build --strip-components=1
cd /build
cargo fetch --locked
accesskit_dependency=$(find /root/.cargo/registry/src -maxdepth 2 -type d -name accesskit_unix-0.23.0)
test -n "$accesskit_dependency"
patch --directory="$accesskit_dependency" -p1 < /input/atspi-cache-signal-arguments.patch
cargo build --release --locked
cp target/release/libaccesskit.so /output/
strip --strip-debug /output/libaccesskit.so
rustc --version > /output/toolchain.txt
ldd --version > /output/glibc.txt
'
mkdir -p "$accesskit_root/Goo.Accessibility/Runtime/linux-x64"
cp "$accesskit_work/output/libaccesskit.so" "$accesskit_root/Goo.Accessibility/Runtime/linux-x64/libgoo-accesskit-0.23.so"
