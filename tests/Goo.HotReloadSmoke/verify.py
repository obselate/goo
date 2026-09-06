import argparse
import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--packages', type=Path, required=True)
    parser.add_argument('--goo-version', required=True)
    parser.add_argument('--diagnostics', action='store_true')
    args = parser.parse_args()
    output = Path(tempfile.mkdtemp(prefix='goo-hotreload-'))
    print(f'Evidence: {output}', flush=True)
    runtime = args.runtime.resolve()
    assert runtime.is_file(), runtime
    app = output / 'app'
    app.mkdir()
    shutil.copyfile(Path(__file__).with_name('Program.gs'), app / 'Program.gs')
    (app / 'Smoke.gsproj').write_text(f'''<Project Sdk="Gsharp.NET.Sdk/0.4.1">
  <PropertyGroup>
    <OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
    <GsharpHotReloadRuntimeAssemblyFullPath>{runtime}</GsharpHotReloadRuntimeAssemblyFullPath>
  </PropertyGroup>
  <ItemGroup><PackageReference Include="Goo" Version="{args.goo_version}" /></ItemGroup>
</Project>
''')
    (app / 'NuGet.Config').write_text(f'''<configuration><packageSources><clear />
<add key="local" value="{args.packages.resolve()}" />
<add key="nuget" value="https://api.nuget.org/v3/index.json" />
</packageSources></configuration>''')
    env = dict(os.environ, GOO_HOTRELOAD_EVIDENCE=str(output), GOO_DEVTOOLS='1' if args.diagnostics else '0', GOO_DEVTOOLS_DIR=str(output / 'endpoints'))
    build = subprocess.run(['dotnet', 'build', str(app / 'Smoke.gsproj'), '--nologo'], capture_output=True, text=True, timeout=120)
    (output / 'build.log').write_text(build.stdout + build.stderr)
    assert build.returncode == 0, build.stdout + build.stderr
    with (output / 'watch.log').open('w') as log:
        watch = subprocess.Popen(['dotnet', 'watch', '--project', str(app / 'Smoke.gsproj'), '--non-interactive'], stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
        try:
            def wait_for(check, seconds=100):
                deadline = time.monotonic() + seconds
                while time.monotonic() < deadline:
                    if watch.poll() is not None:
                        raise AssertionError((output / 'watch.log').read_text())
                    value = check()
                    if value:
                        return value
                    time.sleep(0.1)
                raise AssertionError((output / 'watch.log').read_text())

            def state(label):
                path = output / 'state.txt'
                if not path.exists():
                    return None
                lines = path.read_text().splitlines()
                if len(lines) != 5:
                    return None
                cells = [line.split('|') for line in lines[3:]]
                if any(len(cell) != 7 or cell[1] != label for cell in cells):
                    return None
                for handle in lines[1:3]:
                    current, initial = handle.split(':')
                    assert current == initial and current != '0', lines
                for cell in cells:
                    assert cell[2:6] == ['7', 'keep this text', '2', '6'], lines
                return {'pid': int(lines[0]), 'handles': lines[1:3], 'cells': cells}

            before = wait_for(lambda: state('Before stable'))
            (output / 'before.json').write_text(json.dumps(before, indent=2))
            program = app / 'Program.gs'
            for label in ['After', 'Again']:
                text = program.read_text()
                old = 'Before' if label == 'After' else 'After'
                program.write_text(text.replace(f'LastLabel = "{old} "', f'LastLabel = "{label} "'))
                after = wait_for(lambda: state(label + ' stable'))
                assert after['pid'] == before['pid'] and after['handles'] == before['handles']
                assert [cell[0] for cell in after['cells']] == [cell[0] for cell in before['cells']]
                assert all(int(a[6]) > int(b[6]) for a, b in zip(after['cells'], before['cells']))
                (output / f'{label.lower()}.json').write_text(json.dumps(after, indent=2))
                print(f'{label}: both windows updated in PID {after["pid"]}, native handles and Cell/editor state preserved', flush=True)
            if args.diagnostics:
                cli = str(Path.home() / '.dotnet/tools/goo')
                for title in ['first', 'second']:
                    subprocess.run([cli, 'capture', '--pid', str(before['pid']), '--window', title, '--output', str(output / f'{title}.png')], env=env, check=True, capture_output=True, timeout=20)
            else:
                assert not list((output / 'endpoints').glob('*.json'))
            program.write_text(program.read_text() + '\nfunc AddedMember() int32 -> 9\n')
            wait_for(lambda: 'GSHR1001' in (output / 'watch.log').read_text(), 30)
            assert state('Again stable')['pid'] == before['pid']
            result = {'passed': True, 'diagnostics': args.diagnostics, 'pid': before['pid'], 'windows': 2, 'edits': 2, 'statePreserved': True, 'nativeHandlesPreserved': True, 'structuralEdit': 'GSHR1001'}
            (output / 'result.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result), flush=True)
        finally:
            (output / 'close').touch()
            time.sleep(0.5)
            if watch.poll() is None:
                os.killpg(watch.pid, signal.SIGTERM)
                try:
                    watch.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    os.killpg(watch.pid, signal.SIGKILL)
                    watch.wait()


if __name__ == '__main__':
    main()
