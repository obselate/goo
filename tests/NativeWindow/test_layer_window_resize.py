#!/usr/bin/env python3
import os
import re
import subprocess
import sys


assert os.environ.get('GOO_HEADLESS_WAYLAND') == '1', 'Run with with-headless-wayland.sh'
app = subprocess.run(['dotnet', sys.argv[1]],
                     env=dict(os.environ, WAYLAND_DEBUG='client', GOO_LAYER_WINDOW_RESIZE_SMOKE='1'),
                     capture_output=True, text=True, timeout=30)
assert app.returncode == 0 and 'layer-window-resize-layout: passed' in app.stdout, app.stdout + app.stderr

trace = app.stderr.replace('@', '#')
surface, = re.findall(r'get_layer_surface\(new id zwlr_layer_surface_v1#\d+, (wl_surface#\d+),', trace)
viewport, = re.findall(rf'get_viewport\(new id (wp_viewport#\d+), {surface}\)', trace)
buffers = {}
buffer = None
destination = None
sizes = []
for line in trace.splitlines():
    created = re.search(r'(?:create_immed|create_buffer)\(new id (wl_buffer#\d+), (\d+), (\d+),', line)
    if created:
        name, width, height = created.groups()
        if '.create_buffer(' in line:
            _, width, height = re.search(r'create_buffer\(new id wl_buffer#\d+, (\d+), (\d+), (\d+),', line).groups()
        buffers[name] = int(width), int(height)
    elif match := re.search(rf'{viewport}\.set_destination\((\d+), (\d+)\)', line):
        destination = tuple(map(int, match.groups()))
    elif match := re.search(rf'{viewport}\.set_source\(([^)]+)\)', line):
        assert tuple(map(float, match[1].split(', '))) == (-1, -1, -1, -1), line
    elif match := re.search(rf'{surface}\.attach\((wl_buffer#\d+|nil|NULL),', line):
        buffer = buffers[match[1]] if match[1].startswith('wl_buffer#') else None
    elif f'{surface}.commit()' in line and buffer is not None:
        assert destination == buffer, f'{surface} committed viewport {destination} with buffer {buffer}'
        if not sizes or destination != sizes[-1]:
            sizes.append(destination)

assert sizes == [(412, 64), (476, 128)], f'Expected initial and unstretched resized frame, got {sizes}'
print('layer-window-resize-viewport: passed (412x64 to 476x128, no stretched commit)')
