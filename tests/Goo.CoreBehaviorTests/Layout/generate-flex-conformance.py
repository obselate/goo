#!/usr/bin/env python3
import argparse
import base64
import hashlib
import html
import json
import pathlib
import re
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description="Regenerate Chromium border boxes. Never run in CI.")
    parser.add_argument("--chromium", default=shutil.which("chromium") or shutil.which("google-chrome"))
    parser.add_argument("--font", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[2] / "Goo.VulkanProof/Assets/Text/VendSans-VariableFont_wght.ttf")
    args = parser.parse_args()
    path = pathlib.Path(__file__).with_name("flex-conformance.json")
    table = json.loads(path.read_text())
    font = args.font.read_bytes()
    digest = hashlib.sha256(font).hexdigest()
    if digest != table["fontSha256"]:
        raise ValueError(f"Expected VendSans SHA256 {table['fontSha256']}, got {digest}")
    script = r"""
const table = TABLE;
const lengths = new Set(['width','height','minWidth','minHeight','maxWidth','maxHeight','flexBasis','padding','paddingLeft','paddingRight','paddingTop','paddingBottom','borderWidth','gap','rowGap','columnGap','fontSize']);
function build(spec, policy) {
  const el = document.createElement('div');
  el.style.cssText = 'box-sizing:border-box;border:0 solid;min-width:auto;min-height:auto;font-weight:400;font-variation-settings:\"wght\" 400;';
  if (spec.text === undefined) el.style.cssText += 'display:flex;flex-direction:column;align-content:flex-start;';
  else el.textContent = spec.text;
  for (let [key, value] of Object.entries(spec.style || {})) {
    key = key[0].toLowerCase() + key.slice(1);
    if (key === 'padding' && typeof value === 'object') {
      for (const [edge, amount] of Object.entries(value)) el.style['padding' + edge] = amount + 'px';
      continue;
    }
    if (key === 'textWrap') { key = 'whiteSpace'; value = value === 'NoWrap' ? 'pre' : 'pre-wrap'; }
    else if (key === 'textTrimming') { el.style.overflow = 'hidden'; key = 'textOverflow'; value = 'ellipsis'; }
    else if (typeof value === 'string' && !lengths.has(key) && key !== 'fontFamily') value = value.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase());
    el.style[key] = typeof value === 'number' && lengths.has(key) ? value + 'px' : value;
  }
  if (policy && !['hidden','scroll'].includes(el.style.overflow)) {
    if (el.style.width) el.style.minWidth = el.style.width;
    if (el.style.height) el.style.minHeight = el.style.height;
  }
  for (const child of spec.children || []) el.append(build(child, policy));
  return el;
}
function boxes(root) {
  const origin = root.getBoundingClientRect();
  return [root, ...root.querySelectorAll('div')].map(el => {
    const r = el.getBoundingClientRect();
    return [r.x-origin.x, r.y-origin.y, r.width, r.height];
  });
}
(async () => {
  await document.fonts.load('14px FlexConformance');
  await document.fonts.ready;
  for (const test of table.cases) {
    const host = document.createElement('div');
    host.style.cssText = `width:${test.viewport[0]}px;height:${test.viewport[1]}px`;
    const root = build(test.tree, false);
    host.append(root);
    document.body.append(host);
    test.boxes = boxes(root);
    if (test.deviation) {
      root.remove();
      const alternative = build(test.tree, true);
      host.append(alternative);
      test.deviation.boxes = boxes(alternative);
    }
    host.remove();
  }
  document.body.textContent = JSON.stringify(table);
  document.body.dataset.ready = 'true';
})();
""".replace("TABLE", json.dumps(table))
    css = "@font-face{font-family:FlexConformance;font-weight:100 900;src:url(data:font/ttf;base64," + base64.b64encode(font).decode() + ")}body{margin:0;font-family:FlexConformance;font-size:16px;line-height:1.2;white-space:pre-wrap}"
    css += "*{scrollbar-width:none}"
    with tempfile.TemporaryDirectory(prefix="flex-chromium-", dir=path.parents[3]) as run:
        page = pathlib.Path(run) / "table.html"
        page.write_text(f"<!doctype html><style>{css}</style><body><script>{script}</script>")
        result = subprocess.run([args.chromium, "--headless", "--disable-gpu", "--no-sandbox", "--no-proxy-server", "--disable-background-networking", f"--user-data-dir={run}/profile", "--virtual-time-budget=10000", "--dump-dom", page.as_uri()], check=True, text=True, capture_output=True)
        match = re.search(r'<body data-ready="true">(.*?)</body>', result.stdout, re.S)
        if not match:
            raise RuntimeError(result.stdout + result.stderr)
        generated = json.loads(html.unescape(match[1]))
    generated["chromium"] = subprocess.check_output([args.chromium, "--version"], text=True).strip()
    path.write_text(json.dumps(generated, indent=2) + "\n")
    print(f"Recorded {len(generated['cases'])} cases with {generated['chromium']}")


if __name__ == "__main__":
    main()
