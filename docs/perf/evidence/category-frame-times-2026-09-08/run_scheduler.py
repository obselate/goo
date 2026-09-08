import argparse,hashlib,json,os,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--round',type=int,choices=range(4),required=True);p.add_argument('--validation',action='store_true');args=p.parse_args()
v=['baseline','candidate','candidate','baseline'][args.round]
exe=root/f'published-{v}'/'Goo.AsyncReadbackSmoke'
expected=json.loads((root/'expected-binaries.json').read_text())[v]
assert hashlib.sha256(exe.read_bytes()).hexdigest()==expected
e={k:v for k,v in os.environ.items() if not k.startswith('GOO_')}
e.pop('VK_INSTANCE_LAYERS',None);e.pop('DOTNET_GCConserveMemory',None)
e.update(WAYLAND_DISPLAY='goo-category-nested',SDL_VIDEODRIVER='wayland',VK_LOADER_LAYERS_DISABLE='~implicit~',GOO_VK_DIAGNOSTICS='1',GOO_GALLERY_CATEGORY_FRAME_TIMES='1',GOO_CATEGORY_FRAME_TIMES_LABEL=f'{args.round}-{v}')
if args.validation:e['VK_INSTANCE_LAYERS']='VK_LAYER_KHRONOS_validation'
out=root/('scheduler-validation' if args.validation else 'scheduler-runs');out.mkdir(exist_ok=True)
log=out/f'{args.round}-{v}.log';assert not log.exists()
start=time.monotonic()
with log.open('w') as f:res=subprocess.run([str(exe)],cwd=exe.parent,env=e,stdout=f,stderr=subprocess.STDOUT,timeout=260)
assert hashlib.sha256(exe.read_bytes()).hexdigest()==expected
row={'round':args.round,'variant':v,'binary_sha256':expected,'exit':res.returncode,'wall_seconds':time.monotonic()-start,'log':str(log),'environment':{k:v for k,v in e.items() if k.startswith(('GOO_','VK_')) or k in ['WAYLAND_DISPLAY','SDL_VIDEODRIVER']}}
log.with_suffix('.json').write_text(json.dumps(row,indent=2));print(json.dumps(row),flush=True)
if res.returncode: print(log.read_text()[-3000:]);raise SystemExit(res.returncode)
