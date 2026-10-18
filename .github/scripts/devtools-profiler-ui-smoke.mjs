import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {inflateSync} from 'node:zlib';

const run = promisify(execFile);
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? '/tmp/goo-profiler-ui');
await mkdir(output, {recursive: true});
const cli = path.join(root, 'tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll');
const children = [];
function launch(file, name, args = []) {
    const child = spawn('dotnet', [path.join(root, file), ...args], {
        env: {...process.env, GOO_DEVTOOLS: '1', GOO_DEVTOOLS_INPUT: '1'},
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const log = createWriteStream(path.join(output, name + '.log'));
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    children.push(child);
    return child.pid;
}
async function command(args) {
    return (await run('dotnet', [cli, ...args], {maxBuffer: 32 * 1024 * 1024, timeout: 35000})).stdout;
}
async function request(args) {
    return (await command([...args, '--json'])).trim().split('\n').map(JSON.parse);
}
async function snapshot(pid) {
    const responses = await request(['attach', '--pid', String(pid), '--once', '--wait', '30000']);
    return responses.find(item => item.payload?.added).payload.added;
}
async function click(pid, key) {
    const nodes = await waitSnapshot(pid, data => data.some(item => item.key === key && item.actionable),
        'Missing actionable control ' + key);
    const node = nodes.find(item => item.key === key && item.actionable);
    return request(['input', 'click', '--pid', String(pid), '--target', node.target]);
}
async function wheel(pid, key, delta, modifier) {
    const node = (await snapshot(pid)).find(item => item.key === key);
    assert(node, 'Missing wheel surface ' + key);
    await request(['input', 'wheel', '--pid', String(pid), '--target', node.target,
        '--delta-y', String(delta), ...(modifier ? ['--' + modifier] : [])]);
}
async function waitSnapshot(pid, predicate, failure = 'Profiler UI state did not settle') {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        const nodes = await snapshot(pid);
        if (predicate(nodes)) return nodes;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    await writeFile(path.join(output, `failure-${pid}.json`), JSON.stringify(await snapshot(pid)));
    const elements = (await snapshot(pid)).find(node => node.key === 'tab-elements');
    if (elements) {
        await request(['input', 'click', '--pid', String(pid), '--target', elements.target]);
        await writeFile(path.join(output, `failure-${pid}-elements.json`), JSON.stringify(await snapshot(pid)));
    }
    throw Error(failure);
}
const content = nodes => nodes.filter(node => node.content).map(node => node.content).join('\n');
function branch(nodes, key) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const visit = node => node ? [node, ...(node.childIds ?? []).flatMap(id => visit(byId.get(id)))] : [];
    return visit(nodes.find(node => node.key === key));
}
const text = (nodes, key) => content(branch(nodes, key));
const status = nodes => text(nodes, 'profiler-status');
function seconds(value) {
    const match = value.match(/^([+-]?[\d.]+)\s*(µs|ms|s)$/);
    assert(match, 'Not a human-readable time: ' + value);
    return Number(match[1]) * ({'µs': 1e-6, ms: 1e-3, s: 1}[match[2]]);
}
function rulerTimes(nodes) {
    const labels = branch(nodes, 'profiler-ruler').filter(node => node.content);
    const base = seconds(labels[0].content);
    return labels.map(node => node.content.startsWith('+') ? base + seconds(node.content) : seconds(node.content));
}
async function capture(pid, name) {
    await command(['capture', '--pid', String(pid), '--output', path.join(output, name + '.png')]);
    await writeFile(path.join(output, name + '.json'), JSON.stringify(await snapshot(pid)));
}
async function selectRenderedFrame(pid, nodes) {
    const overview = nodes.find(node => node.key === 'profiler-overview');
    const png = await readFile(path.join(output, 'timeline.png'));
    assert(png[24] === 8 && png[25] === 6, 'CLI capture is not an RGBA8 PNG');
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
        const length = png.readUInt32BE(offset);
        if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
    }
    const pixels = inflateSync(Buffer.concat(chunks));
    const stride = png.readUInt32BE(16) * 4 + 1;
    for (let y = 0; y < png.readUInt32BE(20); y++) assert.equal(pixels[y * stride], 0, 'CLI capture row filter changed');
    const candidates = [];
    let budgetRow = -1;
    for (let y = 3; y < 54; y++) {
        let gray = 0;
        for (let x = 1; x < overview.bounds.width - 2; x++) {
            const at = Math.round(overview.bounds.y + y) * stride + 1 + Math.round(overview.bounds.x + x) * 4;
            const [r, g, b] = pixels.subarray(at, at + 3);
            if (r > 80 && r < 200 && Math.max(r, g, b) - Math.min(r, g, b) < 30) gray++;
            if ((g > r * 1.1 && g > b * 1.05) || (r > 180 && r > b * 1.2)) candidates.push(x);
        }
        if (gray > overview.bounds.width * 0.8) budgetRow = y;
    }
    assert(budgetRow >= 35 && budgetRow <= 40, 'Frame overview scale did not stay near three budgets');
    for (const x of [...new Set(candidates)].sort((a, b) => a - b).filter((value, index, values) => index === 0 || value - values[index - 1] > 1)) {
        for (const fraction of [0.25, 0.75]) {
            await request(['input', 'click', '--pid', String(pid), '--target', overview.target,
                '--offset-x', String(x + fraction), '--offset-y', '30']);
            const selected = await snapshot(pid);
            if (selected.some(node => node.key === 'summary-row-Render')) return selected;
        }
    }
    assert.fail('No rendered frame in overview');
}
async function resizeDetails(pid) {
    const nodes = await snapshot(pid);
    const divider = nodes.find(node => node.key === 'profiler-details-divider');
    assert(divider, 'Selected event has no details divider');
    const before = nodes.find(node => node.key === 'profiler-details').bounds.width;
    const gesture = (await request(['input', 'pointer.down', '--pid', String(pid), '--target', divider.target,
        '--offset-x', '3', '--offset-y', '50'])).find(item => item.payload)?.payload.gestureId;
    for (const event of ['pointer.move', 'pointer.up']) {
        await request(['input', event, '--pid', String(pid), '--x', String(divider.bounds.x - 80),
            '--y', String(divider.bounds.y + 50), '--gesture', gesture]);
    }
    assert((await snapshot(pid)).find(node => node.key === 'profiler-details').bounds.width > before + 50,
        'Details divider did not resize the pane');
}
async function dragRange(pid) {
    const ruler = (await snapshot(pid)).find(node => node.key === 'profiler-ruler');
    const gesture = (await request(['input', 'pointer.down', '--pid', String(pid), '--target', ruler.target,
        '--offset-x', String(ruler.bounds.width * 0.25), '--offset-y', '10'])).find(item => item.payload)?.payload.gestureId;
    for (const event of ['pointer.move', 'pointer.up']) {
        await request(['input', event, '--pid', String(pid), '--target', ruler.target,
            '--offset-x', String(ruler.bounds.width * 0.75), '--offset-y', '10', '--gesture', gesture]);
    }
}

try {
    const gallery = launch('apps/Goo.Gallery/bin/Release/net10.0/Goo.Gallery.dll', 'gallery');
    await snapshot(gallery);
    const inspector = launch('apps/Goo.DevTools/bin/Release/net10.0/Goo.DevTools.dll', 'devtools', ['--pid', String(gallery)]);
    await snapshot(inspector);
    await click(inspector, 'tab-profiler');
    await waitSnapshot(inspector, data => content(data).includes('Record a real target trace')
        && data.find(node => node.key === 'profiler-record')?.disabled === false,
    'Connected target did not enable Record');
    await click(inspector, 'profiler-record');
    await waitSnapshot(inspector, data => status(data).startsWith('Recording ·') && /[1-9]\d* records/.test(status(data)));
    for (const key of ['rail-item-1', 'rail-item-7', 'rail-item-5']) await click(gallery, key);
    await capture(gallery, 'gallery-during-recording');
    await writeFile(path.join(output, 'contender-discovery.json'), await command(['list', '--json']));
    const contender = launch('apps/Goo.DevTools/bin/Release/net10.0/Goo.DevTools.dll', 'busy-devtools', ['--pid', String(gallery)]);
    await snapshot(contender);
    await click(contender, 'tab-profiler');
    await waitSnapshot(contender, data => data.find(node => node.key === 'profiler-record')?.disabled === false);
    for (let attempt = 0; attempt < 2; attempt++) {
        await click(contender, 'profiler-record');
        const busy = await waitSnapshot(contender, data => content(data).includes('Another client is recording this target'));
        assert.equal(busy.find(node => node.key === 'profiler-record')?.disabled, false,
            'Busy response disconnected the target');
    }
    const contenderProcess = children.find(child => child.pid === contender);
    const contenderExited = new Promise(resolve => contenderProcess.once('exit', resolve));
    contenderProcess.kill('SIGTERM');
    await contenderExited;
    await click(inspector, 'profiler-record');
    let nodes = await waitSnapshot(inspector, data => status(data).startsWith('Complete ·'));
    assert(!status(nodes).includes('PARTIAL'), 'Normal recording was marked partial');
    await click(inspector, 'profiler-fit');
    nodes = await snapshot(inspector);
    assert(content(nodes).includes('16.7 ms (60 Hz) budget'), 'Frame overview budget is missing');
    assert(nodes.some(node => node.key === 'profiler-tab-Phases'), 'Phases table is missing');
    assert(!nodes.some(node => node.key === 'profiler-details'), 'Unselected trace retained an empty details pane');
    const header = branch(nodes, 'profiler-sort-2').find(node => node.content);
    const totalCell = branch(nodes, 'summary-row-Frame').filter(node => node.content)[2];
    assert(totalCell, 'Frame interval is empty or reversed');
    assert(Math.abs(header.bounds.x - totalCell.bounds.x) < 1 && Math.abs(header.bounds.width - 84) < 1,
        'Numeric table header and cells are not aligned');
    assert(!/cpu\.instrumented|submit\.prepare-to-observed/.test(text(nodes, 'profiler-summary')),
        'Phase table retained raw source titles');
    await capture(inspector, 'timeline');
    const framePlot = nodes.find(node => node.key.startsWith('plot-CPUCPU thread '));
    assert(framePlot, 'No correlated frame track');
    nodes = await selectRenderedFrame(inspector, nodes);
    const details = text(nodes, 'profiler-details').split('\n');
    assert(details.includes('Pump'), 'Frame details lost pump correlation');
    assert.match(details[details.indexOf('Pump') + 1], /^[1-9]\d*$/, 'Frame pump correlation is invalid');
    const duration = seconds(details[details.indexOf('Duration') + 1]);
    assert(duration > 0, 'Frame interval is empty or reversed');
    await resizeDetails(inspector);
    await click(inspector, 'profiler-zoom-selection');
    nodes = await snapshot(inspector);
    let times = rulerTimes(nodes);
    assert(times.length >= 2 && times.at(-1) - times[0] <= duration * 1.01,
        'Zoom selection did not fit the selected interval');
    assert(nodes.some(node => node.key.startsWith('slice-label-') && node.content === 'Frame'),
        'Frame is missing from the CPU flame root');
    assert(nodes.some(node => node.key.startsWith('slice-label-') && node.content === 'Render'),
        'Rendered frame has no labelled nested phase');
    await capture(inspector, 'rendered-frame');
    await dragRange(inspector);
    nodes = await snapshot(inspector);
    const frameCells = branch(nodes, 'summary-row-Frame').filter(node => node.content).map(node => node.content);
    assert(frameCells.length === 7, 'Selected range lost the Frame summary');
    assert(Math.abs(seconds(frameCells[2]) - duration * 0.5) < duration * 0.02,
        'Range summary did not clip the enclosing frame');
    assert(frameCells[6].endsWith('*'), 'Boundary-crossing allocation traffic was reported as complete');
    for (let i = 0; i < 4; i++) await click(inspector, 'profiler-zoom-in');
    nodes = await snapshot(inspector);
    assert.equal(new Set(rulerTimes(nodes)).size, rulerTimes(nodes).length, 'Narrow ruler labels lost precision');
    const ruler = branch(nodes, 'profiler-ruler').filter(node => node.content);
    assert(ruler[0].key === 'ruler-base' && ruler.slice(1).every(node => node.content.startsWith('+')),
        'Ruler did not show a base plus offsets');
    const selectedSummary = text(nodes, 'profiler-summary');
    times = rulerTimes(nodes);
    for (let i = 0; i < 5; i++) await wheel(inspector, framePlot.key, -120, 'shift');
    nodes = await snapshot(inspector);
    assert.equal(text(nodes, 'profiler-summary'), selectedSummary, 'Panning changed the selected range');
    assert(rulerTimes(nodes)[0] > times[0], 'Shift+wheel did not pan the viewport');
    await capture(inspector, 'selected-frame');
    await click(inspector, 'profiler-fit');
    nodes = await snapshot(inspector);
    await click(inspector, framePlot.key);
    const escape = (await request(['input', 'key.down', '--pid', String(inspector), '--key', 'Escape']))
        .find(item => item.payload)?.payload.gestureId;
    await request(['input', 'key.up', '--pid', String(inspector), '--key', 'Escape', '--gesture', escape]);
    const windowGroup = nodes.find(node => node.key.startsWith('profiler-group-window-'));
    assert(windowGroup, 'Window title group is missing');
    await click(inspector, windowGroup.key);
    nodes = await snapshot(inspector);
    assert(!nodes.some(node => node.key === framePlot.key), 'Collapsed window retained its frame track');
    assert(nodes.some(node => node.key === 'profiler-group-GPU'), 'GPU group is missing');
    assert(content(nodes).includes('GPU stages'), 'GPU elapsed counters are missing from the GPU lane');
    await click(inspector, 'profiler-group-GPU');
    await click(inspector, 'profiler-tab-Memory');
    nodes = await snapshot(inspector);
    const ownerNames = ['Unknown', 'LayerTarget', 'GlyphAtlas', 'PathAtlas', 'ClipAtlas', 'Staging', 'Image', 'Buffer'];
    const legendOwners = new Set(content(nodes).split('\n').filter(value => ownerNames.includes(value)));
    const positiveOwners = new Set();
    assert(!content(nodes).split('\n').includes('Unknown'), 'Zero-value Unknown owner remained in the legend');
    assert(content(nodes).includes('(first sample)'), 'Memory start did not use the first in-range sample');
    const firstCounter = nodes.find(node => node.key.startsWith('summary-row-'));
    const counterNames = new Set();
    let previousRows = '';
    for (let i = 0; i < 30; i++) {
        const names = nodes.filter(node => node.key.startsWith('summary-row-')).map(node => node.key);
        for (const name of names) counterNames.add(name);
        for (const key of names) {
            const cells = branch(nodes, key).filter(node => node.content).map(node => node.content);
            const owner = cells[0].match(/^GPU (?:live|retired) requirements \/ (.+)$/)?.[1];
            if (owner && parseFloat(cells[4]) > 0) positiveOwners.add(owner);
        }
        if (names.join('\n') === previousRows) break;
        previousRows = names.join('\n');
        await wheel(inspector, 'profiler-summary-rows', -1);
        nodes = await snapshot(inspector);
    }
    for (const owner of ['Unknown', 'LayerTarget', 'GlyphAtlas', 'PathAtlas', 'ClipAtlas', 'Staging', 'Image', 'Buffer']) {
        assert(counterNames.has('summary-row-GPU live requirements / ' + owner), 'Owner name mapping lost ' + owner);
    }
    assert.deepEqual([...legendOwners].sort(), [...positiveOwners].sort(), 'Owner legend does not match positive accounts');
    await wheel(inspector, 'profiler-summary-rows', 5000);
    await waitSnapshot(inspector, data => data.some(node => node.key === firstCounter.key
        && Math.abs(node.bounds.y - firstCounter.bounds.y) < 0.5));
    await capture(inspector, 'memory');
    const beforeScroll = nodes.find(node => node.key === 'profiler-group-Memory').bounds.y;
    await wheel(inspector, 'profiler-tracks', -300);
    nodes = await snapshot(inspector);
    assert(!nodes.some(node => node.key === 'profiler-group-Memory')
        || nodes.find(node => node.key === 'profiler-group-Memory').bounds.y < beforeScroll,
    'Normal wheel did not scroll the track list');
    await wheel(inspector, 'profiler-tracks', 5000);
    await click(inspector, 'profiler-group-Memory');
    await click(inspector, 'profiler-tab-Resources');
    nodes = await snapshot(inspector);
    assert(content(nodes).includes('Image'), 'Image resource kind mapping was lost');
    assert(!content(nodes).includes('Unknown owner'), 'Ownerless resources acquired an Unknown owner label');
    await capture(inspector, 'resources');
    const rows = nodes.filter(node => node.key.startsWith('profiler-event-'));
    assert(rows.length > 0, 'Resource table is empty');
    const sizes = rows.map(row => branch(nodes, row.key).filter(node => node.content).map(node => node.content)[4]);
    assert(sizes.some(value => /[\d.] (B|KiB|MiB|GiB)/.test(value)), 'Resource bytes are not human-readable');
    const resourceCells = rows.map(row => branch(nodes, row.key).filter(node => node.content).map(node => node.content));
    assert(resourceCells.every(cells => cells[1] !== '—'), 'Resource duration did not show lifetime or live');
    assert(resourceCells.every(cells => !cells[3].includes('live before recording') && !cells[3].startsWith('vulkan.')),
        'Resource name retained lifecycle or API text');
    assert(resourceCells.some(cells => /×| (B|KiB|MiB|GiB) /.test(cells[3])), 'Allocation name has no dimensions or size');
    assert(resourceCells.every(cells => !/Resource \d+/.test(cells[5])), 'Owner chain retained an unnamed parent');
    await click(inspector, rows[0].key);
    nodes = await snapshot(inspector);
    assert(text(nodes, 'profiler-details').includes('Kind'), 'Resource row selection lost its details');
    await click(inspector, 'profiler-sort-4');
    nodes = await snapshot(inspector);
    assert(text(nodes, 'profiler-sort-4').includes('↑'), 'Resource Bytes sort did not change direction');
    await click(inspector, 'profiler-lifetimes');
    await capture(inspector, 'selected-resource');
    await writeFile(path.join(output, 'final-snapshot.json'), JSON.stringify(await snapshot(inspector)));
    await click(inspector, 'profiler-clear');
    nodes = await snapshot(inspector);
    assert(content(nodes).includes('Record a real target trace'), 'Clear retained the previous trace');
    console.log('profiler-ui: real_gallery=verified busy=connected owners=8 overview=verified gpu_counter_lane=verified selection=stable clipped_range=verified scrolling=verified tables=verified screenshots=7 clear=verified');
} catch (error) {
    const inspector = children[1]?.pid;
    if (inspector) {
        try { await writeFile(path.join(output, 'failure-snapshot.json'), JSON.stringify(await snapshot(inspector))); } catch {}
    }
    throw error;
} finally {
    for (const child of children.reverse()) child.kill('SIGTERM');
}
