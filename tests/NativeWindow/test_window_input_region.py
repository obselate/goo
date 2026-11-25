#!/usr/bin/env python3
import json
import os
from pathlib import Path
import select
import subprocess
import sys

assert os.environ.get('GOO_HEADLESS_WAYLAND') == '1', 'Run with with-headless-wayland.sh'
runtime = Path(os.environ['XDG_RUNTIME_DIR'])
ipc, = runtime.glob('sway-ipc.*.sock')


def sway(*args):
    return json.loads(subprocess.check_output(['swaymsg', '-s', str(ipc), *args], timeout=5))


def send(process, text):
    process.stdin.write((text + '\n').encode())
    process.stdin.flush()


def expect(process, text):
    assert select.select([process.stdout], [], [], 15)[0], f'Timed out waiting for {text!r}'
    actual = process.stdout.readline().decode().rstrip('\n')
    assert actual == text, f'Expected {text!r}, got {actual!r}'


output, = sway('-t', 'get_outputs')
peer = runtime / 'virtual-pointer'
flags = subprocess.check_output(['pkg-config', '--cflags', '--libs', 'wayland-client'], text=True)
subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', str(Path(__file__).with_name('virtual_pointer.c')),
                '-o', str(peer), *flags.split()], check=True)
env = dict(os.environ, SDL_VIDEODRIVER='wayland', GOO_WINDOW_INPUT_REGION_SMOKE='1')
with subprocess.Popen([str(peer)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0) as pointer:
    try:
        expect(pointer, 'ready')
        with subprocess.Popen(['dotnet', sys.argv[1]], env=env, stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, bufsize=0) as app:
            try:
                def click(x, y, target):
                    rect = output['rect']
                    send(pointer, f'{x} {y} {rect["width"]} {rect["height"]}')
                    if target:
                        expect(app, f'click {target}')

                expect(app, 'ready set')
                click(30, 20, 'background')
                click(30, 80, 'layer')
                send(app, 'resize')
                expect(app, 'ready resize')
                click(30, 20, 'background')
                click(190, 80, 'layer')
                click(190, 115, 'background')
                send(app, 'scale')
                expect(app, 'scale pending')
                sway('output', output['name'], 'scale', '2')
                output, = sway('-t', 'get_outputs')
                assert output['scale'] == 2, output
                expect(app, 'ready scale')
                click(30, 20, 'background')
                click(190, 80, 'layer')
                click(190, 115, 'background')
                send(app, 'empty')
                expect(app, 'ready empty')
                click(30, 80, 'background')
                send(app, 'reset')
                expect(app, 'ready reset')
                click(30, 20, 'layer')
                send(app, 'xdg')
                expect(app, 'ready xdg')
                click(30, 20, None)
                click(30, 80, 'background')
                send(app, 'quit')
                assert app.wait(timeout=15) == 0
                assert not app.stdout.read(), 'Unexpected extra pointer input'
            finally:
                if app.poll() is None:
                    app.kill()
    finally:
        pointer.stdin.close()
        assert pointer.wait(timeout=5) == 0
print('Wayland input region: layer and xdg routing, resize, scale, empty and reset passed')
env.pop('GOO_WINDOW_INPUT_REGION_SMOKE')
env['GOO_LAYER_STILL_IMAGE_SMOKE'] = '1'
env['GOO_LAYER_STILL_IMAGE_EXPECT'] = 'swapchain'
subprocess.run(['dotnet', sys.argv[1]], env=env, timeout=15, check=True)
