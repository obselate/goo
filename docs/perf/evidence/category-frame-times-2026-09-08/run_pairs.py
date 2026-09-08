import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time


root = Path(__file__).resolve().parent
WORKLOADS = ['list-category', 'text-preset', 'layout-reflow']
ROUND_VARIANTS = ['baseline', 'candidate', 'candidate', 'baseline']
PROTOTYPE_FLAGS = {'GOO_REVIEW_SMALL_IMAGE_STAGING', 'GOO_REVIEW_CLIP_INCREMENTAL'}
parser = argparse.ArgumentParser()
parser.add_argument('--round', type=int, choices=range(4), required=True)
parser.add_argument('--validation', action='store_true')
parser.add_argument('--only', choices=WORKLOADS)
args = parser.parse_args()
if args.only and not args.validation:
    parser.error('--only is allowed only with --validation')
variant = ROUND_VARIANTS[args.round]
exe = root / f'published-{variant}' / 'Goo.AsyncReadbackSmoke'
expected_path = root / 'expected-binaries.json'
if not expected_path.is_file():
    raise SystemExit(f'missing fixed binary manifest: {expected_path}')
expected = json.loads(expected_path.read_text())
if set(expected) != {'baseline', 'candidate'} or any(not isinstance(expected[v], str) for v in expected):
    raise SystemExit(f'invalid fixed binary manifest: {expected_path}')
binary_sha256 = hashlib.sha256(exe.read_bytes()).hexdigest()
if binary_sha256 != expected[variant]:
    raise SystemExit(f'{exe} hash {binary_sha256} does not match expected {variant} hash {expected[variant]}')
env = {k: v for k, v in os.environ.items() if not k.startswith('GOO_')}
env.pop('VK_INSTANCE_LAYERS', None)
env.pop('DOTNET_GCConserveMemory', None)
env.update(WAYLAND_DISPLAY='goo-category-nested', SDL_VIDEODRIVER='wayland', VK_LOADER_LAYERS_DISABLE='~implicit~', GOO_VK_DIAGNOSTICS='1', GOO_GALLERY_REVIEW_BENCH='1', GOO_GALLERY_REVIEW_PACE16MS='1')
if args.validation:
    env['VK_INSTANCE_LAYERS'] = 'VK_LAYER_KHRONOS_validation'
workloads = [args.only] if args.only else WORKLOADS
out = root / ('validation' if args.validation else 'runs') / f'{args.round}-{variant}'
existing_logs = {p.stem for p in out.glob('*.log')} if out.exists() else set()
manifest_path = out / 'runs.json'
if not args.validation or not args.only:
    if existing_logs or manifest_path.exists():
        raise SystemExit(f'refusing to overwrite existing benchmark data: {out}')
    rows = []
else:
    if existing_logs and not manifest_path.is_file():
        raise SystemExit(f'existing validation logs have no manifest: {out}')
    rows = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    if any(row.get('round') != args.round or row.get('variant') != variant for row in rows):
        raise SystemExit(f'validation manifest round/variant mismatch: {manifest_path}')
    if any(row.get('workload') in workloads for row in rows) or any(w in existing_logs for w in workloads):
        raise SystemExit(f'refusing to overwrite existing validation workload: {out}')
out.mkdir(parents=True, exist_ok=True)
for workload in workloads:
    if workload not in WORKLOADS:
        raise SystemExit(f'unsupported workload: {workload}')
    key = 'GOO_GALLERY_REVIEW_STATE' if workload in ['opening', 'shader-radial-light', 'shader-dither'] else 'GOO_GALLERY_REVIEW_WORKLOAD'
    run_env = dict(env, **{key: workload})
    if PROTOTYPE_FLAGS.intersection(run_env):
        raise SystemExit(f'prototype flag present in benchmark environment: {PROTOTYPE_FLAGS.intersection(run_env)}')
    log = out / f'{workload}.log'
    start = time.monotonic()
    with log.open('w') as stream:
        result = subprocess.run([str(exe)], cwd=exe.parent, env=run_env, stdout=stream, stderr=subprocess.STDOUT, timeout=150)
    end_hash = hashlib.sha256(exe.read_bytes()).hexdigest()
    if end_hash != binary_sha256:
        raise SystemExit(f'binary changed during run: {exe}')
    row = {'round': args.round, 'variant': variant, 'workload': workload, 'exit': result.returncode, 'wall_seconds': time.monotonic() - start, 'binary_sha256': binary_sha256, 'log': str(log), 'environment': {k: v for k, v in run_env.items() if k.startswith('GOO_') or k.startswith('VK_') or k in ['WAYLAND_DISPLAY', 'SDL_VIDEODRIVER']}}
    rows.append(row)
    (out / 'runs.json').write_text(json.dumps(rows, indent=2) + '\n')
    print(json.dumps(row), flush=True)
    if result.returncode:
        print(log.read_text()[-4000:], flush=True)
        raise SystemExit(result.returncode)
