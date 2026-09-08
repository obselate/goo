import json,re,csv
from pathlib import Path
import analyze_review_breakdown as stats
root=Path(__file__).resolve().parent
expected=json.loads((root/'expected-binaries.json').read_text())
labels=['All Categories','Forms & Inputs','Selection','Buttons','Display & Feedback']
runs=[];pooled={v:{'first-cycle':[],'repeated':[]} for v in expected}
def fields(line):
 matches=list(re.finditer(r'(?:^| )([a-z_]+)=',line))
 return {m.group(1):line[m.end():matches[i+1].start() if i+1<len(matches) else len(line)].strip() for i,m in enumerate(matches)}
for i,v in enumerate(['baseline','candidate','candidate','baseline']):
 log=root/'scheduler-runs'/f'{i}-{v}.log';manifest=json.loads(log.with_suffix('.json').read_text())
 assert manifest['exit']==0 and manifest['binary_sha256']==expected[v]
 assert manifest['round']==i and manifest['variant']==v
 assert manifest['environment']=={'WAYLAND_DISPLAY':'goo-category-nested','SDL_VIDEODRIVER':'wayland','VK_LOADER_LAYERS_DISABLE':'~implicit~','GOO_VK_DIAGNOSTICS':'1','GOO_GALLERY_CATEGORY_FRAME_TIMES':'1','GOO_CATEGORY_FRAME_TIMES_LABEL':f'{i}-{v}'}
 text=log.read_text();lines=text.splitlines();rows=[fields(l) for l in lines if l.startswith('category-sample ')]
 assert len(rows)==105
 present=[];starts=[]
 for index,row in enumerate(rows):
  assert int(row['index'])==index and row['content_verified']=='True' and row['present_fence_observed']=='True'
  assert row['source']==labels[index%5] and row['destination']==labels[(index%5+1)%5]
  phase='first-cycle' if index<5 else 'repeated';assert row['phase']==phase
  start=int(row['start_ticks']);handoff=int(row['handoff_ticks']);completion=int(row['completion_observed_ticks'])
  assert 0<start<=handoff<=completion
  assert int(row['injection_to_handoff_ns'])>=0 and int(row['injection_to_completion_observed_ns'])>=int(row['injection_to_handoff_ns'])
  starts.append(start);present.append(int(row['present_id']))
  pooled[v][phase].append(row)
 assert starts==sorted(set(starts)) and present==sorted(set(present))
 summary=next(l for l in lines if l.startswith('category-frame-times:'))
 assert 'present_fence_support=True' in summary and 'resource_failures=0' in summary
 assert 'total_samples=105' in summary and 'idle_close=1' in summary and 'validation_failures=0' in summary
 counters=[json.loads(l) for l in lines if l.startswith('{') and json.loads(l).get('kind')=='counters']
 assert counters and counters[-1]['vulkanObjectCount']==0
 for c in counters:
  assert all(c.get(k,0)==0 for k in ['validationErrorCount','validationErrors','resultFailureCount','fatalCode','fatalValue'])
 def summarize(rs):
  return {metric:stats.summary([int(r[metric])/1e6 for r in rs])|{'p99':stats.percentile([int(r[metric])/1e6 for r in rs],.99)} for metric in ['injection_to_handoff_ns','injection_to_completion_observed_ns']}
 runs.append({'round':i,'variant':v,'samples':105,'repeated_ms':summarize(rows[5:]),'summary':summary})
aggregate={v:{phase:summarize(rs) for phase,rs in groups.items()} for v,groups in pooled.items()}
edges={v:{labels[d]:summarize([r for r in groups['repeated'] if r['destination']==labels[d]]) for d in range(5)} for v,groups in pooled.items()}
output={'selections':420,'repeated_selections':400,'unit':'ms','semantics':'native injection to presentation handoff and completion observation, not scanout','aggregate':aggregate,'destinations':edges,'runs':runs}
(root/'scheduler-results.json').write_text(json.dumps(output,indent=2)+'\n')
with (root/'scheduler-numbers.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['variant','phase','metric','n','p50_ms','p95_ms','p99_ms'])
 for v,phases in aggregate.items():
  for phase,metrics in phases.items():
   for metric,s in metrics.items():w.writerow([v,phase,metric,s['n'],s['median'],s['p95'],s['p99']])
print(json.dumps(aggregate,indent=2))
