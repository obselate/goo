#!/usr/bin/env python3
import argparse
import base64
import hashlib
import html
import json
import pathlib
import re
import random
import shutil
import subprocess
import tempfile


def seeded_cases(seed):
    rng = random.Random(seed)
    directions = ("Row", "RowReverse", "Column", "ColumnReverse")
    align = ("FlexStart", "Center", "FlexEnd", "Stretch")
    distribution = ("FlexStart", "Center", "FlexEnd", "SpaceBetween", "SpaceAround")

    def node(style, *children, text=None):
        result = {"style": style}
        if children:
            result["children"] = list(children)
        if text is not None:
            result["text"] = text
        return result

    for theme in ("direction", "wrap", "grow", "shrink", "basis", "alignment", "gap",
                  "edges", "position", "min-max", "size", "aspect-ratio", "display",
                  "overflow", "baseline", "nested"):
        for i in range(25):
            direction = directions[i % 4]
            main, cross = ("Width", "Height") if direction.startswith("Row") else ("Height", "Width")
            size = rng.randrange(105, 161)
            style = {main: size, cross: rng.randrange(80, 145), "FlexDirection": direction}
            children = [{main: rng.randrange(22, 37), cross: rng.randrange(12, 29)}
                        for _ in range(4)]
            features = ["direction"]

            if theme == "direction":
                features += ["rtl", "justify"]
                style["Direction"] = ("LeftToRight", "RightToLeft")[i // 4 % 2]
                style["JustifyContent"] = (*distribution, "SpaceEvenly")[i % 6]
                for child in children:
                    child[main] //= 2
            elif theme in ("wrap", "alignment", "gap"):
                features += ["wrap", "align-content"]
                style[main] = 80
                style["FlexWrap"] = ("Wrap", "WrapReverse")[i // 4 % 2]
                style["AlignContent"] = (*distribution, "Stretch")[i % 6]
                if theme == "alignment":
                    features += ["align-items", "align-self", "justify"]
                    style["AlignItems"] = align[i % 4]
                    style["JustifyContent"] = (*distribution, "SpaceEvenly")[i % 6]
                    children[0]["AlignSelf"] = align[i // 4 % 4]
                    del children[0][cross]
                    del children[1][cross]
                if theme == "gap":
                    features += ["row-gap", "column-gap"]
                    style["RowGap"] = (rng.randrange(2, 11), "7%")[i % 2]
                    style["ColumnGap"] = ("4%", rng.randrange(2, 11))[i % 2]
            elif theme in ("grow", "shrink", "basis", "min-max"):
                features += ["grow", "shrink", "basis", "min-max"] if theme == "min-max" else [theme]
                positive = theme == "grow" or (theme in ("basis", "min-max") and i % 2 == 0)
                style[main] = size + 60 if positive else 74
                for index, child in enumerate(children):
                    child["Min" + main] = 0
                    if theme != "shrink":
                        child["FlexGrow"] = rng.choice((0.25, 0.5, 1, 2, 3))
                    if theme != "grow":
                        child["FlexShrink"] = rng.choice((0.25, 0.5, 1, 2, 3))
                    if theme in ("basis", "min-max"):
                        child["FlexBasis"] = (0, rng.randrange(25, 41), "25%", "auto")[(i + index) % 4]
                    if theme == "min-max":
                        child["Min" + main] = (12, "18%", 0, "5%")[index]
                        child["Max" + main] = ("37%", 43, "49%", 38)[index]
                        child["Min" + cross] = (8, "15%")[index % 2]
                        child["Max" + cross] = ("35%", 24)[index % 2]
            elif theme == "edges":
                features += ["margin", "padding", "border"]
                style[main] += 55
                style["Padding"] = rng.randrange(2, 8)
                style["BorderWidth"] = {"Top": 2, "Right": 3, "Bottom": 1, "Left": 4}
                children[0]["Margin"] = {"Left": -2, "Right": "3%", "Top": "5%", "Bottom": 4}
                children[1]["Margin"] = "2%"
                children[2]["Padding"] = {"Left": "6%", "Right": 2, "Top": 1, "Bottom": "4%"}
                children[3]["BorderWidth"] = rng.randrange(1, 4)
            elif theme == "position":
                features += ["absolute", "relative", "inset"]
                style.update(Position="Relative", Padding=4, BorderWidth=2)
                children[0].update(Position="Absolute", Left="17%", Bottom=rng.randrange(1, 12))
                children[1].update(Position="Absolute", Right=7, Top="13%")
                if i % 2:
                    children[1]["Left"] = 5
                    children[1]["Width"] = "auto"
                children[2].update(Position="Relative", Left=-3, Top="8%")
                children[3].update(Position="Static", Left=20, Top=20)
            elif theme == "size":
                features += ["auto-size", "percent-size"]
                children[0].update({main: "auto", cross: "45%"})
                children[1].update({main: "23%", cross: "auto"})
                children[2].update({main: "35%", cross: "25%"})
            elif theme == "aspect-ratio":
                features += ["aspect-ratio", "auto-size", "align-items"]
                style["AlignItems"] = align[i % 4]
                children[0].update(Width="auto", AspectRatio=rng.choice((1.25, 1.5, 2)))
                children[1].update(Height="auto", AspectRatio=rng.choice((0.5, 1, 2)))
            elif theme == "display":
                features += ["display-none"]
                children[i % 4]["Display"] = "None"
            elif theme == "overflow":
                features += ["overflow", "shrink", "automatic-minimum"]
                style[main] = 75
                for index, child in enumerate(children):
                    child[main] = rng.randrange(30, 42)
                    child["Overflow"] = ("Hidden", "Scroll", "Visible", "Visible")[(index + i) % 4]
            elif theme == "baseline":
                features += ["baseline", "align-items", "align-self", "text"]
                style.update(FlexDirection=("Row", "RowReverse")[i % 2], Width=260, Height=100,
                             AlignItems="Baseline")
            elif theme == "nested":
                features += ["nested", "auto-size", "percent-size", "text"]

            tree = [node(child) for child in children]
            if theme == "baseline":
                for index, text in enumerate(("Layout", "baseline", "Hgx")):
                    text_style = {"FontFamily": "FlexConformance", "FontSize": rng.randrange(11, 27),
                                  "LineHeight": 1.2, "TextWrap": "NoWrap"}
                    if index == 2:
                        text_style["AlignSelf"] = "Baseline"
                    tree[index] = node(text_style, text=text)
            if theme in ("nested", "size", "display", "overflow"):
                index = i % 4 if theme == "display" else 0
                depth = 2 + i % 3 if theme == "nested" else 2
                branch = node({"Width": 10, "Height": 6})
                if theme == "nested":
                    branch = node({"FontFamily": "FlexConformance", "FontSize": rng.randrange(10, 15),
                                   "LineHeight": 1.2, "MinWidth": 0,
                                   "TextWrap": ("Wrap", "NoWrap")[i % 2]}, text="Flex box")
                for level in range(2, depth):
                    branch = node({"Width": "80%", "Height": "auto",
                                   "FlexDirection": directions[(i + level) % 4]},
                                  branch, node({"Width": 5, "Height": 8}))
                tree[index] = node(children[index], branch)

            yield {"name": f"seeded-{theme}-{i:02d}", "features": features, "tolerance": 1,
                   "viewport": [400, 400], "tree": node(style, *tree)}


def main():
    parser = argparse.ArgumentParser(description="Regenerate Chromium border boxes. Never run in CI.")
    parser.add_argument("--chromium", default=shutil.which("chromium") or shutil.which("google-chrome"))
    parser.add_argument("--font", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[2] / "Goo.VulkanProof/Assets/Text/VendSans-VariableFont_wght.ttf")
    parser.add_argument("--seed", type=int, default=421986)
    args = parser.parse_args()
    path = pathlib.Path(__file__).with_name("flex-conformance.json")
    table = json.loads(path.read_text())
    # Preserve observed Yoga geometry only while its input is unchanged.
    previous = {case["name"]: case for case in table["cases"] if "features" in case}
    cases = list(seeded_cases(args.seed))
    table["seed"] = args.seed
    table["cases"] = [case for case in table["cases"] if "features" not in case] + cases
    font = args.font.read_bytes()
    digest = hashlib.sha256(font).hexdigest()
    if digest != table["fontSha256"]:
        raise ValueError(f"Expected VendSans SHA256 {table['fontSha256']}, got {digest}")
    script = r"""
const table = TABLE;
const lengths = new Set(['width','height','minWidth','minHeight','maxWidth','maxHeight','flexBasis','padding','margin','borderWidth','gap','rowGap','columnGap','fontSize','left','right','top','bottom']);
function cssLength(value) { return typeof value === 'number' ? value + 'px' : value; }
function build(spec) {
  const el = document.createElement('div');
  el.style.cssText = 'box-sizing:border-box;position:relative;border:0 solid;min-width:auto;min-height:auto;font-weight:400;font-variation-settings:\"wght\" 400;';
  if (spec.text === undefined) el.style.cssText += 'display:flex;flex-direction:column;align-content:flex-start;';
  else {
    el.textContent = spec.text;
    el.style.overflowWrap = 'break-word';
  }
  for (let [key, value] of Object.entries(spec.style || {})) {
    key = key[0].toLowerCase() + key.slice(1);
    if (['margin','padding','borderWidth'].includes(key) && typeof value === 'object') {
      for (const [edge, amount] of Object.entries(value)) {
        const property = key === 'borderWidth' ? 'border' + edge + 'Width' : key + edge;
        el.style[property] = cssLength(amount);
      }
      continue;
    }
    if (key === 'direction') value = value === 'RightToLeft' ? 'rtl' : 'ltr';
    if (key === 'flexWrap' && value === 'NoWrap') value = 'nowrap';
    if (key === 'textWrap') { key = 'whiteSpace'; value = value === 'NoWrap' ? 'pre' : 'pre-wrap'; }
    else if (key === 'textTrimming') { key = 'textOverflow'; value = value === 'Ellipsis' ? 'ellipsis' : 'clip'; }
    else if (typeof value === 'string' && !lengths.has(key) && key !== 'fontFamily') value = value.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase());
    el.style[key] = typeof value === 'number' && lengths.has(key) ? value + 'px' : value;
  }
  if (spec.text !== undefined && spec.style.TextTrimming === 'Ellipsis' && !('MinWidth' in spec.style)) {
    el.style.minWidth = '0px';
  }
  for (const child of spec.children || []) el.append(build(child));
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
    const root = build(test.tree);
    host.append(root);
    document.body.append(host);
    test.boxes = boxes(root);
    host.remove();
  }
  document.body.textContent = JSON.stringify(table);
  document.body.dataset.ready = 'true';
})();
""".replace("TABLE", json.dumps(table))
    css = "@font-face{font-family:FlexConformance;font-weight:100 900;src:url(data:font/ttf;base64," + base64.b64encode(font).decode() + ")}body{margin:0;font-family:FlexConformance;font-size:16px;line-height:1.2;white-space:pre-wrap}"
    css += "*{scrollbar-width:none}"
    with tempfile.TemporaryDirectory(prefix="flex-chromium-") as run:
        page = pathlib.Path(run) / "table.html"
        page.write_text(f"<!doctype html><style>{css}</style><body><script>{script}</script>")
        result = subprocess.run([args.chromium, "--headless", "--disable-gpu", "--no-sandbox", "--no-proxy-server", "--disable-background-networking", f"--user-data-dir={run}/profile", "--virtual-time-budget=10000", "--dump-dom", page.as_uri()], check=True, text=True, capture_output=True)
        match = re.search(r'<body data-ready="true">(.*?)</body>', result.stdout, re.S)
        if not match:
            raise RuntimeError(result.stdout + result.stderr)
        generated = json.loads(html.unescape(match[1]))
    for case in generated["cases"]:
        old = previous.get(case["name"])
        if old and old["tree"] == case["tree"] and "deviation" in old:
            case["deviation"] = old["deviation"]
    generated["chromium"] = subprocess.check_output([args.chromium, "--version"], text=True).strip()
    path.write_text(json.dumps(generated, indent=2) + "\n")
    print(f"Recorded {len(generated['cases'])} cases with {generated['chromium']}")


if __name__ == "__main__":
    main()
