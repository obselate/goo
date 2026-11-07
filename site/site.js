const M={"orange": "M187.572 107.91C181.139 101.49 183.371 91.0719 191.972 87.3619C198.222 84.6664 202.292 85.5785 206.98 90.7253C218.256 103.105 199.446 119.761 187.572 107.91Z", "yellow": "M46.0024 173.718C38.7257 181.45 44.1098 195.278 54.395 195.278C61.8974 195.278 64.4545 193.961 67.1853 188.69C69.1236 184.949 69.2404 183.013 67.7898 178.628C65.7078 172.332 62.2763 170.072 54.7881 170.072C51.2334 170.072 48.2817 171.298 46.0024 173.718Z", "green2": "M11.3203 129.015C8.88476 126.584 8.88476 121.048 11.3203 118.618C15.4622 114.484 25.2107 118.132 25.2107 123.816C25.2107 129.5 15.4622 133.149 11.3203 129.015Z", "green1": "M4.79382 50.1892C-1.03346 54.2632 -1.65731 63.1993 3.52275 68.3716C8.53459 73.3713 14.6352 72.9702 19.7756 67.3012C28.6941 57.465 15.6703 42.587 4.79382 50.1892Z", "blue2": "M172.222 34.2469C166.571 34.2469 163.591 26.0911 167.732 21.9589C173.862 15.8402 183.494 24.6796 177.682 31.0898C176.107 32.8259 173.651 34.2469 172.222 34.2469Z", "blue1": "M66.9684 3.86717C58.5727 12.245 64.4287 25.2056 76.608 25.2056C87.0511 25.2056 91.9206 12.1836 84.4782 4.16806C79.424 -1.27487 72.2436 -1.39932 66.9684 3.86717Z", "splat": "M99.0567 20.8753C103.74 15.919 109.427 11.7649 114.393 9.67437C123.9 5.66996 129.639 5.51748 138.226 9.03736C145.561 12.0457 149.52 16.4776 155.164 27.9991C159.859 37.5841 163.909 40.2361 177.9 42.8838C189.965 45.1668 194.916 48.5684 197.497 56.3449C199.006 60.8951 198.783 62.5268 195.922 67.8309C194.087 71.231 188.688 77.5398 183.924 81.8505C175.965 89.0513 175.256 90.2227 175.212 96.2579C175.178 100.985 176.271 104.284 179.109 108.015L179.309 108.277C181.489 111.143 184.843 115.551 186.888 118.236C194.575 128.337 188.077 137.157 171.784 138.736C158.673 140.006 155.48 141.768 152.191 149.545C149.881 155.001 149.618 158.896 150.478 174.855C151.037 185.23 151.854 196.603 152.295 200.13C153.627 210.797 148.89 215.89 139.595 213.784C134.117 212.542 132.493 205.658 134.583 192.553C135.877 184.447 135.822 180.459 134.354 176.038C127.688 155.949 102.747 162.104 98.0086 185.009C96.2392 193.553 93.2149 196.552 87.6366 195.288C82.8855 194.21 80.4562 189.622 80.4562 181.723C80.4562 174.955 75.0926 167.458 67.928 164.21C63.7309 162.308 59.9647 161.943 50.5966 162.53C35.745 163.461 29.6048 160.723 26.6641 151.865C24.9373 146.663 25.1804 145.461 29.7358 136.674C35.262 126.012 35.9802 118.318 31.8841 113.671C30.383 111.969 24.7274 108.257 19.3133 105.421C8.21834 99.6082 6.25316 97.1913 6.30367 89.4261C6.34313 83.4153 8.9018 79.9481 17.5707 74.1638C26.5489 68.17 28.5898 62.8817 27.3855 48.728C26.5489 38.9051 26.8662 35.8198 29.1581 31.4578C34.7174 20.8838 45.9765 19.5172 59.3081 27.7982C73.8409 36.8259 85.9808 34.7112 99.0567 20.8753ZM73.0139 108.052C83.5436 108.052 92.0797 99.5162 92.0797 88.9864C92.0797 78.4566 83.5436 69.9206 73.0139 69.9206C62.4841 69.9206 53.948 78.4566 53.948 88.9864C53.948 99.5162 62.4841 108.052 73.0139 108.052ZM150.773 75.3644C150.773 85.8941 142.237 94.4302 131.707 94.4302C121.178 94.4302 112.642 85.8941 112.642 75.3644C112.642 64.8346 121.178 56.2985 131.707 56.2985C142.237 56.2985 150.773 64.8346 150.773 75.3644Z"};
const W=["M8.724 77.91C7.06715 77.91 5.724 76.5669 5.724 74.91V63.844C5.724 62.1871 7.06715 60.844 8.724 60.844H36.358C40.598 60.844 43.036 58.724 43.036 54.272C43.036 53.2651 41.7656 52.6685 40.8925 53.17C37.4639 55.1393 32.5601 56.18 29.044 56.18C10.918 56.18 0 45.792 0 28.09C0 7.95 13.78 0 28.726 0C33.725 0 39.0043 1.40162 43.2533 4.0909C44.5207 4.89308 46.3293 4.23706 46.581 2.75838C46.7375 1.83873 47.5344 1.166 48.4673 1.166H59.1096C60.7689 1.166 62.1131 2.51306 62.1096 4.17242L62.01 50.668C62.01 69.96 53.106 77.91 34.238 77.91H8.724ZM30.952 38.902C38.16 38.902 43.036 34.874 43.036 28.09C43.036 21.306 38.16 17.278 30.952 17.278C23.426 17.278 18.762 21.306 18.762 28.09C18.762 34.874 23.426 38.902 30.952 38.902Z", "M96.4724 0C111.63 0 127.424 6.89 127.424 28.09C127.424 49.078 111.63 56.18 96.4724 56.18C81.4204 56.18 65.6264 49.078 65.6264 28.09C65.6264 6.89 81.4204 0 96.4724 0ZM96.5784 38.902C103.892 38.902 108.662 34.874 108.662 28.09C108.662 21.306 103.892 17.278 96.5784 17.278C89.1584 17.278 84.4944 21.306 84.4944 28.09C84.4944 34.874 89.1584 38.902 96.5784 38.902Z", "M161.17 0C176.328 0 192.122 6.89 192.122 28.09C192.122 49.078 176.328 56.18 161.17 56.18C146.118 56.18 130.324 49.078 130.324 28.09C130.324 6.89 146.118 0 161.17 0ZM161.276 38.902C168.59 38.902 173.36 34.874 173.36 28.09C173.36 21.306 168.59 17.278 161.276 17.278C153.856 17.278 149.192 21.306 149.192 28.09C149.192 34.874 153.856 38.902 161.276 38.902Z"];
const C = { orange: '#EF6A4D', yellow: '#F9A238', green2: '#6CBC5F', green1: '#6CBC5F', blue2: '#478AD1', blue1: '#478AD1' };
const DOTS = Object.keys(C);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ROOT = document.body.dataset.root, TN = +document.body.dataset.tutorial, root = document.documentElement;
const TUTS = JSON.parse($('#tutorial-data').textContent);
const KEY = 'goo-progress';
const progress = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
const NAMES = { text: 'Text content', label: 'Button text', title: 'Window title' };
const TOKENS = /("[^"]*")|\b(package|import|class|struct|data|enum|interface|private|public|internal|shared|var|let|override|func|init|return|if|else|for|in|switch|case|nil|true|false|new|using|guard)\b|\b(int32|int64|float32|float64|bool|string|[A-Z]\w*)\b|\b(\d+(?:\.\d+)?)\b|(\/\/.*)/g;
const SPLASH = ['#478AD1', '#6CBC5F', '#EF6A4D', '#F9A238'];
const ICONS = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
const COPY = `<button class="icon-btn copy" type="button" aria-label="Copy" title="Copy">${ICONS.copy}</button>`;
const LANGS = { gsharp: 'G#', gs: 'G#', csharp: 'C#', cs: 'C#', fsharp: 'F#', vb: 'VB' };

document.body.insertAdjacentHTML('afterbegin', `<svg class="defs" aria-hidden="true"><filter id="goo" x="-5%" y="-80%" width="110%" height="260%"><feGaussianBlur stdDeviation="6"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -8"/></filter><filter id="goo-mix" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/><feColorMatrix in="b" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -8" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></svg><p class="sr" role="status" id="status"></p>`);
for (const el of $$('[data-mark]')) el.innerHTML = `<svg viewBox="0 0 211 215" aria-hidden="true"><path d="${M.splat}" fill-rule="evenodd" fill="currentColor"/>${DOTS.map(k => `<path d="${M[k]}" fill="${C[k]}"/>`).join('')}</svg>`;
for (const el of $$('[data-word]')) el.innerHTML = `<svg class="word" viewBox="0 0 193 78" aria-hidden="true">${W.map(d => `<path d="${d}" fill="currentColor"/>`).join('')}</svg>`;
for (const el of $$('[data-icon]')) el.insertAdjacentHTML('afterbegin', ICONS[el.dataset.icon]);

const highlight = (src, gsharp, defaults = {}) => esc(src).split('\n').map(line => '<span class="line">' + (gsharp ? line.replace(TOKENS, (m, s, k, t, n, c) => {
  const key = s && s.match(/^"\{(\w+)\}"$/)?.[1];
  if (key) return `<span class="s">"<span class="edit" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="${NAMES[key]}" data-key="${key}">${esc(defaults[key])}</span>"</span>`;
  return `<span class="${s ? 's' : k ? 'k' : t ? 't' : n ? 'n' : 'c'}">${m}</span>`;
}) : line) + (gsharp && defaults.text && line.includes('var count') ? '<span class="hint" aria-hidden="true"></span>' : '') + '</span>').join('\n');

for (const box of $$('.code')) {
  const code = $('code', box);
  box.dataset.text = code.textContent;
  code.innerHTML = code.textContent.split('\n').map(l => `<span>${esc(l)}</span>`).join('');
  box.insertAdjacentHTML('beforeend', COPY);
}
for (const code of $$('.prose pre > code')) {
  const pre = code.parentElement, lang = code.className.match(/language-(\S+)/)?.[1] || '', text = code.textContent.replace(/\n$/, '');
  const rows = /^(sh|bash)$/.test(lang) && !/\\$|^[\s#]/m.test(text);
  pre.outerHTML = rows
    ? `<div class="cmds">${text.split('\n').filter(Boolean).map(c => `<div class="cmd copyable" data-text="${esc(c).replace(/"/g, '&quot;')}"><code>${esc(c)}</code>${COPY}</div>`).join('')}</div>`
    : `<div class="codebox copyable"><div class="bar"><span>${LANGS[lang] || lang || 'text'}</span>${COPY}</div><pre class="src" tabindex="0"><code>${highlight(text, LANGS[lang] === 'G#')}</code></pre></div>`;
}
for (const table of $$('.prose table')) table.outerHTML = `<div class="table" tabindex="0">${table.outerHTML}</div>`;

const counter = $('pre[data-edit]');
const DEFAULTS = {};
if (counter) {
  let src = counter.textContent;
  [['text', /Text\{Content: "([^"{]*)"/], ['label', /Text\{Content: "([^"{]*)"/], ['title', /Title: "([^"]*)"/]].forEach(([key, re]) => {
    const m = src.match(re);
    DEFAULTS[key] = m[1];
    src = src.replace(m[0], m[0].replace(`"${m[1]}"`, `"{${key}}"`));
  });
  counter.innerHTML = '<code>' + highlight(src, true, DEFAULTS) + '</code>';
}
for (const el of $$('.gwin:empty')) el.innerHTML = '<div class="gwin-bar"><span data-bind="title"></span><i></i><i></i><i></i></div><div class="gwin-body"><p data-bind="text" aria-live="polite"></p><span class="goo"><button type="button" data-add data-bind="label"></button></span></div>';

for (const box of $$('.live')) {
  const state = { count: 0, ...DEFAULTS };
  const render = () => {
    for (const el of $$('[data-bind]', box)) el.textContent = String(state[el.dataset.bind]).replaceAll('$count', state.count);
    for (const el of $$('.hint', box)) el.textContent = state.count;
  };
  box.addEventListener('input', e => {
    const key = e.target.dataset?.key;
    if (!key) return;
    if (e.target.textContent.includes('\n')) e.target.textContent = e.target.textContent.replace(/\n/g, '');
    state[key] = e.target.textContent;
    render();
  });
  box.addEventListener('keydown', e => { if (e.target.dataset?.key && e.key === 'Enter') e.preventDefault(); });
  for (const btn of $$('[data-add]', box)) btn.addEventListener('click', () => {
    state.count++;
    render();
    for (const el of $$('.hint, .flash', box)) el.animate([{ background: 'rgba(249,162,56,.5)' }, {}], 900);
    if (still) return;
    for (const el of $$('[data-bind="text"]', box)) el.animate([{ transform: 'scale(1.14)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    const goo = btn.parentElement, drop = document.createElement('span');
    drop.className = 'splash';
    drop.style.background = SPLASH[state.count % 4];
    goo.append(drop);
    goo.classList.add('dripping');
    drop.animate([{ transform: 'translate(-50%, 0) scale(1)' }, { transform: 'translate(-50%, -54px) scale(.25)' }], { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => {
      drop.remove();
      if (!$('.splash', goo)) goo.classList.remove('dripping');
    };
  });
  for (const btn of $$('[data-reset]', box)) btn.addEventListener('click', () => {
    Object.assign(state, { count: 0 }, DEFAULTS);
    for (const el of $$('.edit', box)) el.textContent = DEFAULTS[el.dataset.key];
    render();
  });
  render();
}

const status = $('#status');
const copied = (b, box) => {
  clearTimeout(b.timer);
  b.dataset.label ??= b.getAttribute('aria-label');
  b.setAttribute('aria-label', 'Copied');
  b.classList.add('ok');
  box.classList.add('copied');
  status.textContent = 'Copied';
  b.timer = setTimeout(() => {
    b.classList.remove('ok');
    b.setAttribute('aria-label', b.dataset.label);
    box.classList.remove('copied');
    status.textContent = '';
  }, 1500);
};
document.addEventListener('click', e => {
  const b = e.target.closest('.copy');
  if (b) {
    const box = b.closest('.copyable'), c = $('code', box).cloneNode(true);
    for (const h of $$('.hint', c)) h.remove();
    const text = box.dataset.text ?? c.textContent, area = document.createElement('textarea');
    const fallback = () => {
      area.value = text;
      area.style.cssText = 'position:fixed;top:0;opacity:0';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      b.focus();
      ok ? copied(b, box) : status.textContent = 'Copy failed';
    };
    navigator.clipboard ? navigator.clipboard.writeText(text).then(() => copied(b, box), fallback) : fallback();
  }
  const tab = e.target.closest('.tabs button');
  if (tab) {
    const tabs = $$('button', tab.parentElement), boxes = $$('.code', tab.parentElement.parentElement);
    tabs.forEach((x, i) => { x.setAttribute('aria-pressed', x === tab); boxes[i].hidden = x !== tab; });
  }
  if (e.target.closest('.nav a, .side a')) document.body.classList.remove('open');
});
$('#theme').onclick = () => {
  const t = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = t;
  localStorage.setItem('goo-theme', t);
};
$('#menu').onclick = e => e.currentTarget.setAttribute('aria-expanded', document.body.classList.toggle('open'));

const hero = $('svg.mascot');
if (hero) {
  hero.innerHTML = `<path class="body" d="${M.splat}" fill-rule="evenodd"/>${DOTS.map(k => `<path class="dot" d="${M[k]}" fill="${C[k]}"/>`).join('')}`;
  const dots = $$('.dot', hero).map((el, i) => { const b = el.getBBox(), x = b.x + b.width / 2 - 105, y = b.y + b.height / 2 - 110, l = Math.hypot(x, y); return { el, ux: x / l, uy: y / l, p: i * 1.9 }; });
  const orbit = t => {
    for (const d of dots) {
      const r = 7 + 5 * Math.sin(t / 1400 + d.p), w = 5 * Math.sin(t / 2100 + d.p * 2);
      d.el.setAttribute('transform', `translate(${(d.ux * r - d.uy * w).toFixed(2)} ${(d.uy * r + d.ux * w).toFixed(2)})`);
    }
    if (!still) requestAnimationFrame(orbit);
  };
  orbit(0);
}

const tiles = $('.tiles');
if (tiles) tiles.innerHTML = TUTS.map(([t, href, img]) => `<a class="tile" href="${ROOT + href}"><span class="shot"><img src="${ROOT + img}" alt=""></span><h3>${t}</h3></a>`).join('');

const path = $('.path');
const drawPath = () => {
  if (!path) return;
  const next = TUTS.findIndex((t, i) => !progress.has(i));
  $('ol', path).innerHTML = TUTS.map(([t, href], i) => {
    const on = progress.has(i);
    return `<li style="--i:${i + 1}"${on ? ' class="done"' : ''}><a class="tut" href="${ROOT + href}" aria-label="${t}${on ? ', done' : i === next ? ', next' : ''}"><span class="drop">${on ? ICONS.check : i + 1}</span><span class="name">${t}</span>${i === next ? '<b class="tag" aria-hidden="true">Next</b>' : ''}</a></li>`;
  }).join('');
  $('output', path.parentElement).value = `${progress.size}/${TUTS.length}`;
  const box = path.getBoundingClientRect();
  const pts = $$('.drop', path).map(b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top]; });
  const seg = pts.slice(1).map((b, i) => {
    const a = pts[i], h = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]), dx = (b[0] - a[0]) / 2, dy = (b[1] - a[1]) / 2;
    return `<path${progress.has(i) && progress.has(i + 1) ? ' class="on"' : ''} d="M${a} C${h ? [a[0] + dx, a[1]] : [a[0], a[1] + dy]} ${h ? [b[0] - dx, b[1]] : [b[0], b[1] - dy]} ${b}"/>`;
  });
  const svg = $('svg', path);
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = `<g filter="url(#goo-mix)">${seg.join('')}${pts.map((p, i) => `<circle class="${progress.has(i) ? 'on' : i === next ? 'next' : ''}" cx="${p[0]}" cy="${p[1]}"/>`).join('')}</g>`;
};

const drips = () => $$('.drip').forEach((s, j) => {
  const w = s.parentElement.clientWidth;
  let seed = j * 977 + 13;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  let g = `<rect x="-30" y="-40" width="${w + 60}" height="40"/>`;
  for (let x = 0; x < w + 20; x += 24 + rnd() * 20) g += `<circle cx="${x}" cy="0" r="${8 + rnd() * 9}"/>`;
  for (let x = 30 + rnd() * 90; x < w - 24; x += 100 + rnd() * 170) {
    const r = 5 + rnd() * 4, l = 12 + rnd() * 18;
    g += `<rect x="${x - r * .7}" y="0" width="${r * 1.4}" height="${l}" rx="${r * .7}"/><circle cx="${x}" cy="${l}" r="${r}"/><circle class="fall" cx="${x}" cy="${l}" r="${r * .85}" data-m="${24 + rnd() * 20}"/>`;
  }
  s.innerHTML = `<g filter="url(#goo)" fill="currentColor">${g}</g>`;
});

const article = $('.article'), outline = $('.outline'), follow = $('.follow');
let marks = [];
if (article) {
  const content = $('#steps');
  if (TN >= 0) {
    const img = $('img', content), shot = img?.closest('p');
    if (img) $('.preview').innerHTML = `<div class="gwin"><div class="gwin-bar"><span>${TUTS[TN][0]}</span><i></i><i></i><i></i></div><div class="gwin-body shot"><img src="${img.getAttribute('src')}" alt="${esc(img.alt)}"></div></div>`;
    shot?.classList.add('lead-shot');
    for (const h of $$(':scope > h2', content)) {
      const section = document.createElement('section'), [, num, title] = h.textContent.match(/^(\d+)\.\s*(.*)$/) || [, '', h.textContent];
      section.className = 'step';
      section.id = h.id;
      h.removeAttribute('id');
      h.before(section);
      section.append(h);
      while (section.nextSibling && section.nextSibling.nodeName !== 'H2') section.append(section.nextSibling);
      h.textContent = title;
      h.outerHTML = `<header><span class="num">${num}</span>${h.outerHTML}<button class="done-btn" type="button" aria-pressed="false">Done</button></header>`;
    }
    marks = $$('.step', content);
    const stepKey = 'goo-steps-' + TUTS[TN][1], stepsDone = new Set(JSON.parse(localStorage.getItem(stepKey) || '[]'));
    const show = () => {
      marks.forEach((s, i) => {
        $('.done-btn', s).setAttribute('aria-pressed', stepsDone.has(s.id));
        outline.children[i].classList.toggle('done', stepsDone.has(s.id));
      });
      $('.meter i').style.width = `${stepsDone.size / marks.length * 100}%`;
      $('.meter b').textContent = `${stepsDone.size}/${marks.length}`;
      marks.every(s => stepsDone.has(s.id)) ? progress.add(TN) : progress.delete(TN);
      localStorage.setItem(stepKey, JSON.stringify([...stepsDone]));
      localStorage.setItem(KEY, JSON.stringify([...progress]));
      $$('#nav-groups ul:first-of-type > li').forEach((li, i) => li.classList.toggle('done', progress.has(i)));
    };
    outline.innerHTML = marks.map(s => `<li><a href="#${s.id}">${$('h2', s).textContent}</a></li>`).join('');
    for (const s of marks) $('.done-btn', s).onclick = () => { stepsDone.has(s.id) ? stepsDone.delete(s.id) : stepsDone.add(s.id); show(); };
    show();
    $('.pager').innerHTML = [[TN - 1, 'Previous'], [TN + 1, 'Next']].filter(([i]) => TUTS[i]).map(([i, k]) => `<a href="${ROOT + TUTS[i][1]}" rel="${k.toLowerCase().slice(0, 4)}"><small>${k}</small>${TUTS[i][0]}</a>`).join('');
  } else {
    marks = $$(':scope > h2[id]', content);
    outline.innerHTML = marks.map(h => `<li><a href="#${h.id}">${esc(h.textContent)}</a></li>`).join('');
    follow.hidden = marks.length < 2;
    $('.preview').remove();
    $('.meter').remove();
    $('.pager').remove();
    $$('#nav-groups ul:first-of-type > li').forEach((li, i) => li.classList.toggle('done', progress.has(i)));
  }
  article.classList.toggle('wide', follow.hidden);
  const search = $('.side input');
  search.oninput = () => {
    const query = search.value.trim().toLowerCase();
    for (const ul of $$('#nav-groups ul')) {
      let shown = 0;
      for (const li of ul.children) shown += !(li.hidden = !li.textContent.toLowerCase().includes(query));
      ul.hidden = ul.previousElementSibling.hidden = !shown;
    }
    $('.side p').hidden = !!$('#nav-groups li:not([hidden])');
  };
  addEventListener('keydown', e => { if (e.key === '/' && !e.target.closest('input, [contenteditable]')) { e.preventDefault(); search.focus(); } });
  const current = $('#nav-groups [aria-current]'), side = $('.side');
  if (current) side.scrollTop = current.offsetTop - side.clientHeight / 2;
}

let q = 0;
const req = () => q || (q = requestAnimationFrame(tick));
function tick() {
  q = 0;
  for (const s of $$('.drip')) {
    const p = still ? .45 : clamp((innerHeight - s.getBoundingClientRect().top) / (innerHeight * .75));
    for (const c of $$('.fall', s)) c.setAttribute('transform', `translate(0 ${p * c.dataset.m})`);
  }
  if (!marks.length) return;
  const top = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0, max = root.scrollHeight - innerHeight;
  const line = top + (innerHeight - top) * (.25 + .75 * (max > 0 ? clamp(scrollY / max) : 1));
  const cur = Math.max(0, marks.findLastIndex(s => s.getBoundingClientRect().top < line));
  follow.dataset.focus = cur;
  $$('a', outline).forEach((a, i) => i === cur ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current'));
}
const layout = () => {
  drips();
  drawPath();
  req();
};
addEventListener('scroll', req, { passive: true });
addEventListener('resize', layout);
addEventListener('pageshow', () => { progress.clear(); JSON.parse(localStorage.getItem(KEY) || '[]').forEach(i => progress.add(i)); layout(); });
layout();
document.fonts.ready.then(layout);
