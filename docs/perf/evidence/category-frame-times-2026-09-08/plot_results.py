import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
root=Path(__file__).resolve().parent
j=json.loads((root/"category-results.json").read_text())
plt.rcParams.update({"font.family":"DejaVu Sans","font.size":11,"axes.spines.top":False,"axes.spines.right":False})
fig,axes=plt.subplots(1,2,figsize=(13,5),layout="constrained")
workloads=["list-category","text-preset","layout-reflow"]
labels=["Category switch","Text preset","Layout reflow"]
x=np.arange(3)
for ax,metric,unit,title in [(axes[0],"host_ms","ms","Host frame time"),(axes[1],"frame_alloc_B","KiB","UI allocation")]:
 scale=1024 if metric=="frame_alloc_B" else 1
 for variant,offset,color,label in [("baseline",-.2,"#8393a8","Before"),("candidate",.2,"#327dac","After")]:
  rows=[j["aggregate"][variant][w][metric] for w in workloads]
  bars=ax.bar(x+offset,[r["median"]/scale for r in rows],width=.36,color=color,label=label)
  ax.scatter(x+offset,[r["p95"]/scale for r in rows],marker="_",s=190,color="#252b36",zorder=4)
  for i,r in enumerate(rows): ax.plot([x[i]+offset]*2,[r["median"]/scale,r["p95"]/scale],color=color,linewidth=1.3)
  for b,r in zip(bars,rows): ax.annotate(f'{r["median"]/scale:.2f}',(b.get_x()+b.get_width()/2,b.get_height()),ha="center",xytext=(0,4),textcoords="offset points",fontsize=9)
 ax.set_xticks(x,labels);ax.set_ylabel(unit);ax.set_title(title);ax.grid(axis="y",alpha=.18);ax.set_axisbelow(True);ax.set_ylim(bottom=0)
axes[0].legend(frameon=False)
fig.suptitle("Category work reduction | matched NativeAOT, default Yoga",fontsize=16)
fig.supxlabel("Bars: median | caps: p95 | ABBA, 1,000 measured frames per variant and workload",fontsize=10)
fig.savefig(root/"category-frame-times.png",dpi=150)
fig.savefig(root/"category-frame-times.svg")
