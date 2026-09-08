import argparse
import gzip
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = Path(__file__).resolve().parent
args.output.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='goo-chart-reproduce-') as directory:
    target = Path(directory)
    for name in ['analyze_chart.py', 'analyze_review_breakdown.py', 'plot_chart.py', 'expected-binaries.json']:
        shutil.copy2(source / name, target / name)
    for folder in sorted((source / 'runs').iterdir()):
        out = target / 'runs' / folder.name
        out.mkdir(parents=True)
        for log in folder.glob('*.log.gz'):
            (out / log.name.removesuffix('.gz')).write_bytes(gzip.decompress(log.read_bytes()))
        manifest = json.loads((folder / 'runs.json').read_text())
        for row in manifest:
            row['log'] = str(out / Path(row['log']).name)
        (out / 'runs.json').write_text(json.dumps(manifest, indent=2) + '\n')
    subprocess.run([sys.executable, str(target / 'analyze_chart.py')], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, str(target / 'plot_chart.py')], check=True, stdout=subprocess.DEVNULL)
    for name in ['chart-results.json', 'benchmark-numbers.csv', 'full-cost-breakdown-updated.png', 'full-cost-breakdown-updated.svg']:
        shutil.copy2(target / name, args.output / name)
