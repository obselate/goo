#!/usr/bin/env python3
import contextlib
import os
import pathlib
import re
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time

PROGRAM = pathlib.Path(sys.argv[1]).resolve()


def wait_for(predicate, description):
    until = time.monotonic() + 15
    while time.monotonic() < until:
        result = predicate()
        if result:
            return result
        time.sleep(0.02)
    raise AssertionError(description)


@contextlib.contextmanager
def compositor(root, name, command, extra):
    runtime = root / name
    runtime.mkdir(mode=0o700)
    env = os.environ.copy()
    for key in ('WAYLAND_SOCKET', 'WAYLAND_DISPLAY', 'SWAYSOCK', 'DISPLAY', 'WAYLAND_DEBUG'):
        env.pop(key, None)
    for folder in ('cache', 'config', 'data'):
        path = runtime / folder
        path.mkdir()
        env[f'XDG_{folder.upper()}_HOME'] = str(path)
    env.update(XDG_RUNTIME_DIR=str(runtime), LIBGL_ALWAYS_SOFTWARE='1', **extra)
    log = runtime / 'compositor.log'
    with log.open('w') as output:
        process = subprocess.Popen(['dbus-run-session', '--', *command], env=env, start_new_session=True,
                                   stdout=output, stderr=subprocess.STDOUT)
    try:
        endpoint = wait_for(lambda: next((path for path in runtime.glob('wayland-*') if path.is_socket()), None),
                            f'{name} did not start')
        env.update(WAYLAND_DISPLAY=endpoint.name, XDG_SESSION_TYPE='wayland')
        yield env, endpoint, log
    except BaseException:
        print(log.read_text(), file=sys.stderr)
        for trace in root.glob('*/client.log'):
            print(trace.read_text(), file=sys.stderr)
        raise
    finally:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=10)


@contextlib.contextmanager
def smoke(root, mode, env, endpoint):
    root.mkdir()
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.connect(str(endpoint))
        fd = connection.fileno()
        env = dict(env, WAYLAND_SOCKET=str(fd), WAYLAND_DEBUG='client', XDG_SESSION_TYPE='unspecified')
        del env['WAYLAND_DISPLAY']
        with (root / 'client.log').open('w') as log:
            process = subprocess.Popen(['dotnet', str(PROGRAM), 'session-lock-' + mode, 'org.goo.lock.test',
                                        '--output=' + str(root)], env=env, stdout=log, stderr=subprocess.STDOUT,
                                       pass_fds=(fd,))
    try:
        yield process
        assert process.wait(timeout=20) == 0, f'{mode} failed'
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def expect_file(path, value):
    wait_for(lambda: path.exists() and path.read_text() == value, f'{path.name} did not reach {value}')


def expect_sizes(root, *sizes):
    wait_for(lambda: sorted(path.read_text() for path in root.glob('output-*')) == sorted(sizes),
             f'Lock surface sizes did not reach {sizes}')


def check_trace(trace, outputs, unlock):
    roles = re.findall(r'get_lock_surface\(new id ext_session_lock_surface_v1[#@](\d+), '
                       r'wl_surface[#@](\d+), wl_output[#@](\d+)\)', trace)
    assert len(roles) == outputs and len({output for _, _, output in roles}) == outputs, roles
    for role, surface, _ in roles:
        requests = [line for line in trace.splitlines() if re.search(
            rf'wl_surface[#@]{surface}\.(attach|commit)\(|ext_session_lock_surface_v1[#@]{role}\.ack_configure\(', line)]
        assert len(requests) >= 3 and '.ack_configure(' in requests[0], requests
        assert all('attach(nil' not in line and 'attach(null' not in line for line in requests), requests
    assert 'error(' not in trace, trace
    if unlock:
        done = trace.index('.unlock_and_destroy()')
        after = trace[done:]
        assert '.destroy()' in after[:after.index('.sync(')], after
        assert re.search(r'wl_callback[#@]\d+\.done\(', after), after
    else:
        assert '.unlock_and_destroy()' not in trace, trace


with tempfile.TemporaryDirectory(prefix='goo-session-lock-', dir=os.getenv('RUNNER_TEMP')) as temporary:
    root = pathlib.Path(temporary)
    peer = root / 'keyboard'
    cflags = subprocess.check_output(['pkg-config', '--cflags', '--libs', 'wayland-client', 'xkbcommon'], text=True)
    subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', str(pathlib.Path(__file__).with_name('session_lock_keyboard.c')),
                    '-o', str(peer), *cflags.split()], check=True)
    sway_env = dict(WLR_BACKENDS='headless', WLR_HEADLESS_OUTPUTS='2', WLR_RENDERER='pixman', WLR_LIBINPUT_NO_DEVICES='1')
    with compositor(root, 'sway', ['sway', '-d', '-c', '/dev/null'], sway_env) as (env, endpoint, sway_log):
        ipc = wait_for(lambda: next(iter(endpoint.parent.glob('sway-ipc.*.sock')), None), 'Sway IPC missing')

        def sway(command):
            subprocess.run(['swaymsg', '-s', str(ipc), command], check=True, env=env, stdout=subprocess.DEVNULL)

        sway('output HEADLESS-2 scale 2')
        with subprocess.Popen([peer], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE) as keyboard:
            try:
                assert select.select([keyboard.stdout], [], [], 5)[0] and keyboard.stdout.readline() == b'ready\n'
                unlock = root / 'unlock'
                with smoke(unlock, 'unlock', env, endpoint):
                    expect_file(unlock / 'locked', 'locked')
                    expect_sizes(unlock, '1280x720', '640x360')
                    expect_file(unlock / 'layout-1', 'English (US)')
                    keyboard.stdin.write(b'1')
                    keyboard.stdin.flush()
                    expect_file(unlock / 'layout-2', 'German')
                    with smoke(root / 'denied', 'denied', env, endpoint):
                        pass
                    denied_trace = (root / 'denied' / 'client.log').read_text()
                    assert re.search(r'ext_session_lock_v1[#@]\d+\.destroy\(', denied_trace), denied_trace
                    assert '.unlock_and_destroy()' not in denied_trace, denied_trace
                    sway('output HEADLESS-2 mode --custom 1600x900')
                    expect_sizes(unlock, '1280x720', '800x450')
                    sway('create_output')
                    expect_file(unlock / 'output-3', '1920x1080')
                    sway('output HEADLESS-3 disable')
                    expect_file(unlock / 'removed-3', 'closed')
                    (unlock / 'unlock').touch()
                check_trace((unlock / 'client.log').read_text(), 3, True)
                wait_for(lambda: 'session unlocked' in sway_log.read_text(), 'Compositor did not unlock')
            finally:
                keyboard.stdin.close()
                keyboard.wait(timeout=10)
        close = root / 'close'
        with smoke(close, 'close', env, endpoint):
            expect_file(close / 'locked', 'locked')
            expect_sizes(close, '1280x720', '800x450')
            (close / 'close').touch()
        check_trace((close / 'client.log').read_text(), 2, False)
        wait_for(lambda: 'session lock abandoned' in sway_log.read_text(), 'Compositor did not retain the lock on close')
        assert sway_log.read_text().count('session unlocked') == 1
    weston = ['weston', '--backend=headless-backend.so', '--renderer=pixman', '--socket=wayland-lock-test', '--idle-time=0']
    with compositor(root, 'weston', weston, {}) as (env, endpoint, _):
        with smoke(root / 'absent', 'absent', env, endpoint):
            pass
print('Wayland session lock: inherited socket, two outputs, configure sizes, hotplug, layout changes, unlock, close, rejection and unavailable global passed')
