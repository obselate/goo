import csv
import json
from pathlib import Path
import statistics

import analyze_review_breakdown as prior


root = Path(__file__).resolve().parent
WORKLOADS = ['list-category', 'text-preset', 'layout-reflow']
ROUND_VARIANTS = {0: 'baseline', 1: 'candidate', 2: 'candidate', 3: 'baseline'}
EXPECTED_ENV = {'WAYLAND_DISPLAY': 'goo-category-nested', 'SDL_VIDEODRIVER': 'wayland', 'VK_LOADER_LAYERS_DISABLE': '~implicit~', 'GOO_VK_DIAGNOSTICS': '1', 'GOO_GALLERY_REVIEW_BENCH': '1', 'GOO_GALLERY_REVIEW_PACE16MS': '1'}
expected = json.loads((root / 'expected-binaries.json').read_text())
assert set(expected) == {'baseline', 'candidate'}
run_root = root / 'runs'
assert run_root.is_dir()
folders = sorted(run_root.iterdir())
assert {p.name for p in folders} == {f'{i}-{v}' for i, v in ROUND_VARIANTS.items()}
records = []
samples = {}
for folder in folders:
    round_index, variant = folder.name.split('-', 1)
    round_index = int(round_index)
    assert ROUND_VARIANTS[round_index] == variant
    manifest_path = folder / 'runs.json'
    assert manifest_path.is_file(), manifest_path
    manifest = json.loads(manifest_path.read_text())
    assert len(manifest) == len(WORKLOADS), manifest_path
    assert {row['workload'] for row in manifest} == set(WORKLOADS), manifest_path
    assert all(row['round'] == round_index and row['variant'] == variant and row['exit'] == 0 for row in manifest), manifest_path
    assert all(row['binary_sha256'] == expected[variant] for row in manifest), manifest_path
    for row in manifest:
        workload = row['workload']
        selector = 'GOO_GALLERY_REVIEW_STATE' if workload in ['opening', 'shader-radial-light', 'shader-dither'] else 'GOO_GALLERY_REVIEW_WORKLOAD'
        expected_env = dict(EXPECTED_ENV, **{selector: workload})
        assert row['environment'] == expected_env, (manifest_path, workload, row['environment'])
    manifest_by_workload = {row['workload']: row for row in manifest}
    assert not any(k in manifest_by_workload[w].get('environment', {}) for w in WORKLOADS for k in ['GOO_REVIEW_SMALL_IMAGE_STAGING', 'GOO_REVIEW_CLIP_INCREMENTAL'])
    for path in sorted(folder.glob('*.log')):
        assert path.stem in WORKLOADS, path
        assert manifest_by_workload[path.stem]['log'] == str(path), path
        parsed = prior.parse_log(path)
        assert len(parsed['summaries']) == 1, path
        state = next(iter(parsed['summaries']))
        expected_state = path.stem if path.stem in ['opening', 'shader-radial-light', 'shader-dither'] else path.stem
        assert state == expected_state, (path, state)
        result = prior.analyze_state(parsed, state)
        raw = parsed['gpu_rows'][state]
        cpu = parsed['cpu_rows'][state]
        assert len(raw) == len(cpu) == 500, path
        assert int(result['summary']['measured']) == 500, path
        assert int(result['summary']['completed_frames']) == 500, path
        assert int(result['summary']['timestamp_supported']) == 1, path
        gpu_frames = [int(row['frame_id']) for row in raw]
        cpu_frames = [int(row['frame_id']) for row in cpu]
        assert gpu_frames == cpu_frames and gpu_frames == sorted(set(gpu_frames)), path
        assert all(int(row['main_valid']) == 1 for row in raw), path
        assert all(int(row['valid']) == 1 for row in cpu), path
        assert int(result['summary']['submit_delta']) == 500, path
        assert int(result['summary']['present_delta']) == 500, path
        text = path.read_text()
        assert 'stopwatch_frequency=' in text, path
        owners = [prior.parse_kv_line(line) for line in text.splitlines() if line.startswith('gallery-review-memory-owners,')]
        owner = next(row for row in owners if row['state'] == state and row['phase'] == 'before-gc')
        blocks = [prior.parse_kv_line(line) for line in text.splitlines() if line.startswith('gallery-review-memory-block,')]
        blocks = [row for row in blocks if row['state'] == state and row['phase'] == 'before-gc']
        assert blocks, path
        if path.stem in ['text-preset', 'layout-reflow', 'list-category']:
            assert all(int(row['build_calls']) > 0 and int(row['layout_calls']) > 0 for row in cpu), path
        if path.stem == 'image-upload':
            assert int(owner['image_resident_B']) > 0, path
            assert int(owner['image_staging_allocated_B']) > 0, path
            assert int(owner['image_staging_mapped']) == 1, path
        counters = []
        for line in text.splitlines():
            if not line.startswith('{'):
                continue
            obj = json.loads(line)
            if obj.get('kind') == 'counters':
                counters.append(obj)
                for key in ['validationErrorCount', 'validationErrors', 'fatalCode', 'fatalValue', 'resultFailureCount']:
                    assert obj.get(key, 0) == 0, (path, key, obj.get(key))
        assert counters and counters[-1]['vulkanObjectCount'] == 0, path
        memory = parsed['smaps'][state]['before-gc']
        assert int(owner['swapchain_width']) == 2160 and int(owner['swapchain_height']) == 1350, path
        assert int(owner['swapchain_image_count']) == 3, path
        row = {'round': int(round_index), 'variant': variant, 'workload': path.stem, 'state': state, 'samples': 500, 'host_ms': result['host_ms'], 'frame_alloc_B': result['frame_alloc_B'], 'gpu_main_ms': result['gpu']['main']['time_ms'], 'cpu': result['cpu'], 'memory_counters': result['memory_counters'], 'process_cpu_ms_per_frame': result['process_cpu_ms_per_frame'], 'rss_B': memory['Rss'], 'pss_B': memory['Pss'], 'allocator_resident_B': sum(int(block['resident_B']) for block in blocks), 'owners': owner}
        records.append(row)
        group = samples.setdefault((variant, path.stem), {'host_ms': [], 'frame_alloc_B': [], 'gpu_main_ms': []})
        group['host_ms'].extend(int(row['host_wall_ticks']) * 1000 / parsed['frequency'] for row in raw)
        group['frame_alloc_B'].extend(int(row['current_thread_allocated_delta_B']) for row in raw)
        group['gpu_main_ms'].extend(int(row['main_ns']) / 1000000 for row in raw)

category_destinations = {}
for folder in folders:
    round_index, variant = folder.name.split('-', 1)
    parsed = prior.parse_log(folder / 'list-category.log')
    raw = parsed['gpu_rows']['list-category']
    cpu = parsed['cpu_rows']['list-category']
    for destination, name in enumerate(['All', 'Forms', 'Selection', 'Buttons', 'Feedback']):
        group = category_destinations.setdefault(variant, {}).setdefault(name, {'host_ms': [], 'alloc_B': []})
        group['host_ms'].extend(int(row['host_wall_ticks']) * 1000 / parsed['frequency'] for index,row in enumerate(raw) if index % 5 == destination)
        group['alloc_B'].extend(int(row['current_thread_allocated_delta_B']) for index,row in enumerate(raw) if index % 5 == destination)
for variant, destinations in category_destinations.items():
    for name, metrics in destinations.items():
        destinations[name] = {metric: prior.summary(values) | {'p99': prior.percentile(values, .99)} for metric,values in metrics.items()}

aggregate = {}
for (variant, workload), metrics in samples.items():
    runs = [row for row in records if row['variant'] == variant and row['workload'] == workload]
    assert len(runs) == 2, (variant, workload, len(runs))
    summary = {metric: prior.summary(values) | {'p99': prior.percentile(values, .99)} for metric, values in metrics.items()}
    summary['run_host_medians_ms'] = [row['host_ms']['median'] for row in runs]
    for metric in ['rss_B', 'pss_B', 'allocator_resident_B']:
        summary[metric] = statistics.median(row[metric] for row in runs)
        summary[metric + '_range'] = [min(row[metric] for row in runs), max(row[metric] for row in runs)]
    for metric in ['clip_atlas_resident_B', 'image_staging_configured_B', 'image_staging_allocated_B', 'swapchain_width', 'swapchain_height']:
        summary[metric] = statistics.median(int(row['owners'][metric]) for row in runs)
    for metric in ['gc_total_memory_after_gc_B', 'gc_heap_size_after_gc_B', 'gc_committed_end_B']:
        summary[metric] = statistics.median(row['memory_counters'][metric] for row in runs)
    aggregate.setdefault(variant, {})[workload] = summary

assert len(records) == 12, len(records)
assert {row['workload'] for row in records} == set(WORKLOADS)
assert all(sum(row['variant'] == variant and row['workload'] == workload for row in records) == 2 for variant in ['baseline', 'candidate'] for workload in WORKLOADS)
extents = {(int(row['owners']['swapchain_width']), int(row['owners']['swapchain_height'])) for row in records}
assert extents == {(2160, 1350)}, extents
output = {'baseline_commit': '5d4b360', 'candidate_commit': 'fd104fa6bf4ed9cac34c3c4708c50e3e418c5b26', 'layout': 'Yoga.Net', 'frames': 6000, 'physical_extent': list(next(iter(extents))), 'aggregation': 'pooled 1000 frames per variant and workload, two fresh processes, ABBA order; memory is median of two pre-GC boundaries', 'aggregate': aggregate, 'category_destinations': category_destinations, 'runs': records}
(root / 'category-results.json').write_text(json.dumps(output, indent=2) + '\n')
with (root / 'benchmark-numbers.csv').open('w') as stream:
    writer = csv.writer(stream)
    writer.writerow(['variant', 'workload', 'host_p50_ms', 'host_p95_ms', 'host_p99_ms', 'UI_alloc_p50_B', 'UI_alloc_p95_B', 'GPU_main_p50_ms', 'RSS_MiB', 'PSS_MiB', 'Vulkan_allocator_MiB'])
    for variant, workloads in aggregate.items():
        for workload, row in workloads.items():
            writer.writerow([variant, workload, row['host_ms']['median'], row['host_ms']['p95'], row['host_ms']['p99'], row['frame_alloc_B']['median'], row['frame_alloc_B']['p95'], row['gpu_main_ms']['median'], row['rss_B'] / 1048576, row['pss_B'] / 1048576, row['allocator_resident_B'] / 1048576])
print(json.dumps(aggregate, indent=2))
