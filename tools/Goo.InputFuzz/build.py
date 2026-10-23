import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import wave

root = Path(__file__).resolve().parents[2]
os.chdir(root)
work = root / "artifacts/input-fuzz"
work.mkdir(parents=True, exist_ok=True)
target = sys.argv[1]
manifest = json.loads((root / "tools/Goo.TextNative/manifest.json").read_text())


def fetch(url, digest, path):
    data = urllib.request.urlopen(url).read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit(f"SHA-256 mismatch: {url}")
    path.write_bytes(data)
    return path


def run(*args):
    subprocess.run(args, check=True)


corpus = work / "corpus" / target
corpus.mkdir(parents=True, exist_ok=True)
patterns = {
    "svg": ["tests/Goo.CoreBehaviorTests/Assets/*.svg"],
    "raster": ["tests/Shared/Assets/local-*.png", "tests/Shared/Assets/local-*.jpg", "tests/Shared/Assets/local-*.gif"],
    "native-image": ["tests/Shared/Assets/local-*.png", "tests/Shared/Assets/local-*.jpg", "tests/Shared/Assets/local-*.gif"],
    "font": [
        "tests/Goo.VulkanProof/Assets/Text/*.ttf",
        "tests/Goo.VulkanProof/Assets/Text/*.otf",
        "tests/Goo.VulkanProof/Assets/Text/*.ttc",
        "tests/Goo.VulkanProof/Assets/Text/*.otc",
    ],
    "wav": ["tests/**/*.wav"],
}
for pattern in patterns[target]:
    for fixture in root.glob(pattern):
        shutil.copyfile(fixture, corpus / fixture.name)
if target == "wav" and not any(corpus.iterdir()):
    for channels in (1, 2):
        for width in (1, 2):
            with wave.open(str(corpus / f"pcm-{channels}-{width}.wav"), "wb") as stream:
                stream.setparams((channels, width, 8000, 0, "NONE", "not compressed"))
                stream.writeframes(bytes([128 if width == 1 else 0]) * channels * width * 32)
if not any(corpus.iterdir()):
    raise SystemExit(f"No seed fixtures for {target}")

sanitizers = ["-O1", "-g", "-fno-omit-frame-pointer", "-fsanitize=fuzzer,address,undefined", "-fno-sanitize-recover=all"]
if target in ("svg", "raster", "wav"):
    run("dotnet", "publish", "tools/Goo.InputFuzz/Goo.InputFuzz.gsproj", "-c", "Release", "-o", str(work / "managed-target"))
else:
    hb = manifest["source"]["harfbuzz"]
    archive = fetch(hb["archiveUrl"], hb["archiveSha256"], work / "harfbuzz.tar.xz")
    with tarfile.open(archive) as source:
        source.extractall(work, filter="data")
    source = work / ("harfbuzz-" + hb["version"])
    run("python3", "tools/Goo.TextNative/apply-source-patches.py", "--manifest", "tools/Goo.TextNative/manifest.json", "--source-root", str(source))
    if target == "font":
        run("clang++", "-std=c++17", *sanitizers, "-I" + str(source / "src"), str(source / "src/harfbuzz.cc"), "tools/Goo.InputFuzz/font.cc", "-o", str(work / target))
    else:
        stb = manifest["source"]["stbImage"]
        fetch(stb["url"], stb["sha256"], source / "src/stb_image.h")
        for patch in manifest["build"]["sourcePatches"]:
            if patch["upstreamPath"] == "src/stb_image.h":
                run("python3", "tools/Goo.TextNative/apply-source-patches.py", "--manifest", "tools/Goo.TextNative/manifest.json", "--source-root", str(source), "--patch-name", patch["name"])
        run("clang", *sanitizers, "-I" + str(source / "src"), "tools/Goo.InputFuzz/image.c", "-lm", "-o", str(work / target))
