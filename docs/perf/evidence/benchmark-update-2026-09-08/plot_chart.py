import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np


root = Path(__file__).resolve().parent
data = json.loads((root / 'chart-results.json').read_text())
before = data['aggregate']['baseline']
after = data['aggregate']['candidate']
fig, axes = plt.subplots(2, 2, figsize=(12, 8.3), layout='constrained')
fig.suptitle('Goo 0.5 (Yoga.Net): updated frame costs and memory', fontsize=17, weight='bold')
labels = ['Text preset', 'Layout reflow', 'Category switch']
keys = ['text-preset', 'layout-reflow', 'list-category']
x = np.arange(3)
width = .35
for ax, field, factor, title, ylabel in [
    (axes[0, 0], 'host_ms', 1, 'Active UI frame time after changes', 'ms per completed frame'),
    (axes[0, 1], 'frame_alloc_B', 1 / 1024, 'Active UI allocation after changes', 'KiB per action / frame'),
]:
    medians = [after[key][field]['median'] * factor for key in keys]
    tails = [after[key][field]['p95'] * factor for key in keys]
    p = ax.bar(x - width / 2, medians, width, label='Median', color='#287eab')
    q = ax.bar(x + width / 2, tails, width, label='p95', color='#d87a40')
    fmt = '%.2f' if factor == 1 else '%.0f'
    ax.bar_label(p, fmt=fmt, padding=3, fontsize=9)
    ax.bar_label(q, fmt=fmt, padding=3, fontsize=9)
    ax.set_xticks(x, labels)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(frameon=False)
    ax.set_ylim(0, max(tails) * 1.24)

ax = axes[1, 0]
values = [group['opening']['allocator_resident_B'] / 1048576 for group in [before, after]]
bars = ax.bar(['Before changes', 'After all seven changes'], values, color=['#287eab', '#299878'])
ax.bar_label(bars, fmt='%.2f MiB', padding=3)
ax.set_ylabel('MiB in Vulkan allocator blocks')
ax.set_title(f'Opening: {values[0] - values[1]:.2f} MiB lower allocator residency')
ax.set_ylim(0, max(values) * 1.2)

ax = axes[1, 1]
x = np.arange(2)
memory_keys = ['rss_B', 'pss_B']
full = [before['image-upload'][key] / 1048576 for key in memory_keys]
updated = [after['image-upload'][key] / 1048576 for key in memory_keys]
p = ax.bar(x - width / 2, full, width, label='Before changes', color='#287eab')
q = ax.bar(x + width / 2, updated, width, label='After all seven changes', color='#299878')
ax.bar_label(p, fmt='%.2f', padding=3)
ax.bar_label(q, fmt='%.2f', padding=3)
ax.set_xticks(x, ['RSS', 'PSS'])
ax.set_title('Visible image: process RSS / PSS')
ax.set_ylabel('MiB, pre-GC boundary')
ax.set_ylim(0, max(full + updated) * 1.3)
ax.legend(frameon=False, fontsize=9)
for ax in axes.flat:
    ax.spines[['top', 'right']].set_visible(False)
    ax.grid(axis='y', alpha=.15)
    ax.set_axisbelow(True)
w, h = data['physical_extent']
fig.supxlabel(f'1,000 frames per workload and revision: two runs of 500 after 120 warmup frames. Fresh-process ABBA comparison.\n{w:,} × {h:,} physical pixels. NativeAOT. Before: 373f989. After: d1e10d4. Vulkan residency is not process RSS.', fontsize=9)
fig.savefig(root / 'full-cost-breakdown-updated.png', dpi=150)
fig.savefig(root / 'full-cost-breakdown-updated.svg')
print(root / 'full-cost-breakdown-updated.png')
