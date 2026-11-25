#!/usr/bin/env python3
import os
from pathlib import Path
import resource
import select
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time


runtime = Path(os.environ['XDG_RUNTIME_DIR'])
display = os.environ['WAYLAND_DISPLAY']
if (os.environ.get('GOO_HEADLESS_WAYLAND') != '1' or not runtime.name.startswith('goo-xdg-runtime.')
        or Path(display).name != display or (runtime / display).is_symlink()):
    raise SystemExit('This test must run under with-headless-wayland.sh')
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
command = ['dotnet', sys.argv[1]]

protocol = subprocess.run(command, env=dict(os.environ, GOO_LAYER_WINDOW_FAILURE_SMOKE='protocol'),
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=20)
assert protocol.returncode != 0 and 'Unhandled exception.' in protocol.stdout, protocol.stdout
assert 'Layer-shell Wayland roundtrip failed' in protocol.stdout, protocol.stdout
assert 'wl_surface' in protocol.stdout and 'scale' in protocol.stdout.lower(), protocol.stdout
print('layer-window-protocol-error: passed', flush=True)

with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
    connection.connect(str(runtime / display))
    pid, _, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    compositor = os.pidfd_open(pid)

with tempfile.TemporaryFile(dir=runtime) as log:
    with subprocess.Popen(command, env=dict(os.environ, GOO_LAYER_WINDOW_FAILURE_SMOKE='disconnect'),
                          stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT) as app:
        try:
            deadline = time.monotonic() + 15
            output = b''
            while app.poll() is None and time.monotonic() < deadline:
                output = os.pread(log.fileno(), os.fstat(log.fileno()).st_size, 0)
                if b'layer-window-disconnect: ready\n' in output:
                    break
                time.sleep(0.02)
            else:
                raise AssertionError(f'Layer window did not start: {output.decode(errors="replace")}')
            signal.pidfd_send_signal(compositor, signal.SIGKILL)
            assert select.select([compositor], [], [], 10)[0], 'Compositor did not exit'
            app.communicate(b'\n', timeout=15)
        finally:
            os.close(compositor)
            if app.poll() is None:
                app.kill()
                app.wait()
    log.seek(0)
    output = log.read().decode(errors='replace')
    assert app.returncode == 0 and 'Unhandled exception.' not in output, f'Exit {app.returncode}: {output}'
print('layer-window-disconnect: passed')
