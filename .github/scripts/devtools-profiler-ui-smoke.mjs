import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, open, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connect, createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';
import {inflateSync} from 'node:zlib';

const run = promisify(execFile);
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? '/tmp/goo-profiler-ui');
await mkdir(output, {recursive: true});
const cli = path.join(root, 'tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll');
const children = [];
const proxies = [];
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
async function stopChild(pid) {
    const child = children.find(item => item.pid === pid);
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
}
async function faultProxy(pipe, command) {
    const state = {pipe: `goo-profiler-fault-${process.pid}-${command}`, snapshots: 0, rejected: false, disconnected: false};
    let faultId;
    const server = createServer(client => {
        const target = connect(path.join(tmpdir(), 'CoreFxPipe_' + pipe));
        target.pipe(client);
        createInterface({input: client}).on('line', line => {
            const request = JSON.parse(line.trim());
            if (request.command === 'snapshot') state.snapshots++;
            if (!faultId && request.command === command) {
                faultId = request.id;
                if (command === 'snapshot') request.command = 'profiler-smoke-unknown-command';
                else request.payload.bufferBytes = 'invalid';
                line = JSON.stringify(request);
            }
            target.write(line + '\n');
        }).on('error', () => target.destroy());
        createInterface({input: target}).on('line', line => {
            const response = JSON.parse(line);
            if (response.id === faultId && response.ok === false) state.rejected = true;
        }).on('error', () => client.destroy());
        client.on('error', () => target.destroy());
        target.on('error', () => client.destroy());
        client.on('close', () => { state.disconnected = true; target.destroy(); });
        target.on('close', () => client.destroy());
    });
    proxies.push(server);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(path.join(tmpdir(), 'CoreFxPipe_' + state.pipe), resolve);
    });
    return state;
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
        const activity = (await snapshot(pid)).find(node => node.key === 'activity-toggle');
        if (activity) await request(['input', 'click', '--pid', String(pid), '--target', activity.target]);
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
async function traceFile(pid, action, filename, error) {
    await click(pid, action === 'Import' ? 'profiler-import' : 'profiler-export');
    await click(pid, 'profiler-file-path');
    const gesture = (await request(['input', 'key.down', '--pid', String(pid), '--key', 'A', '--ctrl']))
        .find(item => item.payload)?.payload.gestureId;
    await request(['input', 'key.up', '--pid', String(pid), '--key', 'A', '--ctrl', '--gesture', gesture]);
    await request(['input', 'text', '--pid', String(pid), '--text', filename]);
    await click(pid, 'profiler-file-apply');
    const expected = error ?? (action === 'Import' ? 'Imported ' : 'Exported ') + path.basename(filename);
    return waitSnapshot(pid, data => text(data, 'profiler-file-status').includes(expected), action + ' trace did not finish: ' + expected);
}
function validateChrome(trace) {
    assert.equal(trace.displayTimeUnit, 'ms', 'Chrome display unit changed');
    assert.equal(trace.goo.format, 'goo.profiler/1', 'Lossless Goo metadata is missing');
    const slices = new Map();
    const flows = new Map();
    const phases = new Set();
    const flowEvents = [];
    const gpuCounters = new Map();
    let sequence = 0n;
    for (const event of trace.traceEvents) {
        phases.add(event.ph);
        assert(Number.isSafeInteger(event.pid) && Number.isSafeInteger(event.tid), 'Chrome projected track ids are invalid');
        assert.equal(typeof event.name, 'string');
        if (event.ph === 'M') {
            assert(['process_name', 'thread_name'].includes(event.name));
            assert.equal(typeof event.args.name, 'string');
            continue;
        }
        assert(Number.isFinite(event.ts) && event.ts >= 0, 'Chrome timestamp is invalid');
        const track = event.pid + ':' + event.tid;
        if (event.ph === 'X') {
            assert(Number.isFinite(event.dur) && event.dur >= 0, 'Chrome duration is invalid');
            if (!slices.has(track)) slices.set(track, []);
            slices.get(track).push(event);
        } else if (event.ph === 'C') {
            assert(Object.values(event.args).length > 0 && Object.values(event.args).every(Number.isFinite),
                'Chrome counter contains an unavailable or nonnumeric value');
        } else if (event.ph === 'i') assert(['t', 'p', 'g'].includes(event.s));
        else {
            assert(['s', 't', 'f'].includes(event.ph), 'Unexpected exported Chrome phase');
            assert.equal(typeof event.id, 'string', 'Flow identity lost string precision');
            flowEvents.push(event);
            const key = event.cat + ':' + event.id;
            if (event.ph === 's') flows.set(key, event);
            else {
                const start = flows.get(key);
                assert(start && start.ts <= event.ts, 'Flow endpoints are invalid');
                if (event.ph === 'f') flows.delete(key);
            }
        }
        if (event.goo) {
            const record = event.goo;
            assert.equal(typeof record.Sequence, 'string', 'Record identity lost string precision');
            assert(BigInt(record.Sequence) > sequence, 'Export reordered or duplicated Goo records');
            sequence = BigInt(record.Sequence);
            for (const key of ['Thread', 'Pump', 'Frame', 'Submission', 'Device', 'Resource', 'Parent', 'Allocated']) {
                assert(record[key] === null || typeof record[key] === 'string', 'Goo integer precision lost: ' + key);
            }
            const expected = Number(BigInt(record.Ticks) * 1000000n) / Number(BigInt(trace.goo.frequency));
            assert(Math.abs(event.ts - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-12), 'Tick-to-microsecond conversion changed');
            if (record.Source.startsWith('vulkan.timestamp')) {
                assert.notEqual(event.ph, 'X', 'Unaligned GPU timing became a CPU-clock slice');
                if (record.GpuNs !== null) {
                    const key = record.Device + ':' + record.DeviceGeneration + ':' + record.Event;
                    for (const [other, name] of gpuCounters) {
                        if (other !== key) assert.notEqual(event.name, name, 'GPU stage or device counters were merged');
                    }
                    gpuCounters.set(key, event.name);
                    assert.equal(event.args.elapsed_ns, Number(record.GpuNs), 'GPU elapsed value changed');
                }
            }
        }
    }
    assert.equal(flows.size, 0, 'Export left unmatched flow endpoints');
    for (const events of slices.values()) {
        const stack = [];
        for (const event of events.sort((a, b) => a.ts - b.ts || b.dur - a.dur)) {
            while (stack.length && stack.at(-1) <= event.ts + 1e-9) stack.pop();
            assert(!stack.length || event.ts + event.dur <= stack.at(-1) + 1e-6, 'Chrome lane contains crossing duration slices');
            stack.push(event.ts + event.dur);
        }
    }
    for (const flow of flowEvents) {
        const candidates = slices.get(flow.pid + ':' + flow.tid) ?? [];
        assert(candidates.some(slice => flow.ph === 'f' && flow.bp !== 'e'
            ? slice.ts >= flow.ts : slice.ts <= flow.ts + 1e-9 && slice.ts + slice.dur > flow.ts),
        'Chrome flow has no slice binding');
    }
    for (const phase of ['M', 'X', 'i', 'C']) assert(phases.has(phase), 'Chrome phase mapping lost ' + phase);
    assert(phases.has('s') && phases.has('f'), 'Submission/resource flow correlations are missing');
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
    await stopChild(contender);
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
    for (let i = 0; i < 100; i++) {
        const names = nodes.filter(node => node.key.startsWith('summary-row-')).map(node => node.key);
        for (const name of names) counterNames.add(name);
        for (const key of names) {
            const cells = branch(nodes, key).filter(node => node.content).map(node => node.content);
            const owner = cells[0].match(/^GPU (?:live|retired) requirements \/ (.+)$/)?.[1];
            if (owner && parseFloat(cells[4]) > 0) positiveOwners.add(owner);
        }
        const table = nodes.find(node => node.key === 'profiler-summary-rows');
        const end = Math.max(0, table.contentSize.y - table.bounds.height);
        if (table.scrollOffset.y >= end - 0.5) break;
        const next = Math.min(end, table.scrollOffset.y + 28);
        await wheel(inspector, 'profiler-summary-rows', -1);
        nodes = await waitSnapshot(inspector, data => data.find(node => node.key === 'profiler-summary-rows')
            ?.scrollOffset.y >= next - 0.5, 'Memory table did not scroll');
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
    const exportedPath = path.join(output, 'Gallery trace ü.json');
    await traceFile(inspector, 'Export', exportedPath);
    const exported = JSON.parse(await readFile(exportedPath, 'utf8'));
    validateChrome(exported);
    await click(inspector, 'profiler-clear');
    nodes = await snapshot(inspector);
    assert(content(nodes).includes('Record a real target trace'), 'Clear retained the previous trace');
    const endpoint = (await request(['list'])).flatMap(item => item.targets).find(item => item.pid === gallery);
    for (const command of ['snapshot', 'profiler.start']) {
        const proxy = await faultProxy(endpoint.pipe, command);
        const client = launch('apps/Goo.DevTools/bin/Release/net10.0/Goo.DevTools.dll', 'fault-' + command,
            ['--pipe', proxy.pipe]);
        await snapshot(client);
        if (command === 'snapshot') {
            await waitSnapshot(client, data => proxy.rejected && !proxy.disconnected && proxy.snapshots >= 4
                && content(data).includes('Goo UI gallery'), 'Errored snapshot did not resume automatic snapshots');
        } else {
            await click(client, 'tab-profiler');
            await waitSnapshot(client, data => data.find(node => node.key === 'profiler-record')?.disabled === false);
            await click(client, 'profiler-record');
            await waitSnapshot(client, data => proxy.rejected && proxy.disconnected
                && status(data).startsWith('Complete ·') && status(data).includes('PARTIAL')
                && data.find(node => node.key === 'profiler-record')?.disabled === true,
            'Errored profiler.start did not disconnect');
        }
        console.log(`profiler-ui: fault=${command} rejected=verified snapshots=${proxy.snapshots} disconnected=${proxy.disconnected}`);
        await stopChild(client);
    }
    await stopChild(inspector);
    await stopChild(gallery);
    const offline = launch('apps/Goo.DevTools/bin/Release/net10.0/Goo.DevTools.dll', 'offline-devtools', ['--pid', String(gallery)]);
    await snapshot(offline);
    await click(offline, 'tab-profiler');
    assert.equal((await snapshot(offline)).find(node => node.key === 'profiler-record')?.disabled, true,
        'Offline round trip still had a live recording target');
    await traceFile(offline, 'Import', exportedPath);
    assert(status(await snapshot(offline)).includes('Imported Gallery trace ü.json'), 'Imported trace identity is not visible');
    const roundTripPath = path.join(output, 'round-trip.json');
    await traceFile(offline, 'Export', roundTripPath);
    const roundTrip = JSON.parse(await readFile(roundTripPath, 'utf8'));
    validateChrome(roundTrip);
    assert.deepEqual(roundTrip.goo, exported.goo, 'Round trip lost Goo metadata or completion state');
    assert.deepEqual(roundTrip.traceEvents.filter(event => event.goo).map(event => event.goo),
        exported.traceEvents.filter(event => event.goo).map(event => event.goo), 'Round trip lost record details, nulls or correlation ids');
    await capture(offline, 'imported-trace');
    console.log(`profiler-files: real_gallery_records=${roundTrip.traceEvents.filter(event => event.goo).length} offline_round_trip=lossless chrome_format=validated`);
    const precision = structuredClone(exported);
    precision.goo.originTicks = '9007199254740993';
    precision.goo.start.originTicks = precision.goo.originTicks;
    precision.goo.partial = true;
    precision.goo.dropped = '7';
    precision.goo.reason = 'Gap and integer-precision format fixture';
    const preciseRecords = precision.traceEvents.filter(event => event.goo).map(event => event.goo);
    const oldResource = preciseRecords.find(record => record.Resource !== null)?.Resource;
    assert(oldResource, 'Real trace contains no resource identity');
    for (const record of preciseRecords) {
        if (record.Resource === oldResource) record.Resource = '18446744073709551614';
        if (record.Parent === oldResource) record.Parent = '18446744073709551614';
    }
    const gap = Object.fromEntries(Object.keys(preciseRecords[0]).map(key => [key, null]));
    Object.assign(gap, {Sequence: (BigInt(precision.goo.lastSequence) + 1n).toString(),
        Kind: 'gap', Ticks: precision.goo.endTicks, EndTicks: precision.goo.endTicks, Window: '',
        Event: '0', Category: '0', Result: '0', Name: 'Format gap fixture', Source: 'fixture.gap',
        Unit: 'count', Validity: 'partial', Chrome: '', Value: '7'});
    precision.goo.budgetFull = true;
    precision.goo.lastSequence = precision.goo.nextSeq = (BigInt(gap.Sequence) + 100n).toString();
    precision.traceEvents.push({ph: 'i', name: gap.Name, cat: gap.Source, pid: 1, tid: 1,
        ts: Number(BigInt(gap.Ticks) * 1000000n) / Number(BigInt(precision.goo.frequency)), s: 't', goo: gap});
    const precisionPath = path.join(output, 'gap-precision-fixture.json');
    await writeFile(precisionPath, JSON.stringify(precision));
    await traceFile(offline, 'Import', precisionPath);
    assert(status(await snapshot(offline)).includes('7 dropped') && status(await snapshot(offline)).includes('PARTIAL'),
        'Imported gap or dropped-data status was lost');
    const precisePath = path.join(output, 'gap-precision-roundtrip.json');
    await traceFile(offline, 'Export', precisePath);
    const precise = JSON.parse(await readFile(precisePath, 'utf8'));
    assert.deepEqual(precise.goo, precision.goo, 'Gap, completion or exact origin metadata was lost');
    assert.deepEqual(precise.traceEvents.filter(event => event.goo).map(event => event.goo),
        precision.traceEvents.filter(event => event.goo).map(event => event.goo), 'Gap record or 64-bit resource identity was lost');
    const span = Math.max(1, exported.traceEvents.find(event => event.ph === 'X' && event.dur > 0).dur);
    const external = {traceEvents: [
        {ph: 'M', name: 'process_name', pid: 71, args: {name: 'External fixture'}},
        {ph: 'M', name: 'thread_name', pid: 71, tid: 11, args: {name: 'Imported thread'}},
        {ph: 'B', name: 'Imported work', cat: 'external', pid: 71, tid: 11, ts: 100, args: {label: 'begin'}},
        {ph: 'i', name: 'Instant', cat: 'external', pid: 71, tid: 11, ts: 100 + span / 4, s: 't'},
        {ph: 'I', name: 'Legacy instant', cat: 'external', pid: 71, tid: 11, ts: 100 + span / 3},
        {ph: 'C', name: 'Imported counter', pid: 71, tid: 11, ts: 100 + span / 4, args: {bytes: 17.5, delta: -1.25}},
        {ph: 's', name: 'Link', cat: 'external', id: '9007199254740993', pid: 71, tid: 11, ts: 100 + span / 2},
        {ph: 't', name: 'Link', cat: 'external', id: '9007199254740993', pid: 71, tid: 11, ts: 100 + span * 0.6},
        {ph: 'X', name: 'Imported target', cat: 'external', pid: 71, tid: 12, ts: 100 + span / 2, dur: span / 4},
        {ph: 'f', name: 'Link', cat: 'external', id: '9007199254740993', pid: 71, tid: 12, ts: 100 + span * 0.6, bp: 'e'},
        {ph: 'E', pid: 71, tid: 11, ts: 100 + span, args: {label: 'end'}},
        {ph: 'X', name: 'Crossing A', cat: 'external', pid: 71, tid: 13, ts: 100, dur: span * 0.8},
        {ph: 'X', name: 'Crossing B', cat: 'external', pid: 71, tid: 13, ts: 100 + span * 0.6, dur: span * 0.8},
        {ph: '?', name: 'Future event', pid: 71, tid: 11, ts: 100 + span},
        {ph: 'M', name: 'process_name', pid: 72, args: {name: 'External fixture'}},
        {ph: 'C', name: 'Imported counter', pid: 72, tid: 11, ts: 100 + span / 4, args: {bytes: 19.5}},
    ]};
    const externalObjectPath = path.join(output, 'external-object.json');
    await writeFile(externalObjectPath, JSON.stringify(external));
    await traceFile(offline, 'Import', externalObjectPath);
    const externalPath = path.join(output, 'external-subset.json');
    await writeFile(externalPath, JSON.stringify(external.traceEvents));
    await traceFile(offline, 'Import', externalPath);
    assert(content(await snapshot(offline)).includes('unsupported Chrome'), 'Unknown Chrome events were not reported');
    assert(content(await snapshot(offline)).includes('Imported thread') && content(await snapshot(offline)).includes('External fixture'),
        'Chrome process or thread metadata was lost');
    await click(offline, 'profiler-tab-Memory');
    assert(content(await snapshot(offline)).includes('-1.25'), 'Fractional or negative Chrome counter was lost');
    await click(offline, 'profiler-group-more');
    assert(/-1\.25\s+to/.test(content(await snapshot(offline))), 'Negative counter scale was clamped to zero');
    await capture(offline, 'imported-counters');
    const canonicalPath = path.join(output, 'external-canonical.json');
    await traceFile(offline, 'Export', canonicalPath);
    const canonical = JSON.parse(await readFile(canonicalPath, 'utf8'));
    validateChrome(canonical);
    const externalRecords = canonical.traceEvents.filter(event => event.goo).map(event => event.goo);
    assert.equal(new Set(canonical.traceEvents.filter(event => event.ph === 'C').map(event => event.name)).size, 3,
        'Chrome counter series or processes were merged');
    assert(externalRecords.some(record => record.Kind === 'duration' && record.Chrome.includes('"ph":"B"') && record.Chrome.includes('"ph":"E"')),
        'Begin/end import lost its duration or end arguments');
    assert(externalRecords.some(record => record.Chrome.includes('9007199254740993')), 'Imported flow id lost integer precision');
    for (const event of canonical.traceEvents.filter(event => event.goo?.Source === 'chrome.flow')) {
        const original = JSON.parse(event.goo.Chrome)[0];
        assert.equal(event.id, String(original.id), 'Exported Chrome flow id lost precision');
        assert.equal(event.ph, original.ph, 'Exported Chrome flow direction changed');
    }
    assert(externalRecords.every(record => record.Category === '-1'), 'Imported events became native Goo frame phases');
    assert(externalRecords.some(record => record.Name.startsWith('Unsupported ?')), 'Unknown event became a native phase');
    const badCases = [
        ['negative-duration', {traceEvents: [{ph: 'X', name: 'bad', pid: 1, tid: 1, ts: 0, dur: -1}]}, 'Invalid Chrome duration'],
        ['unmatched-end', {traceEvents: [{ph: 'E', pid: 1, tid: 1, ts: 0}]}, 'Unmatched Chrome end event'],
        ['unmatched-begin', {traceEvents: [{ph: 'B', name: 'bad', pid: 1, tid: 1, ts: 0}]}, 'Unmatched Chrome begin event'],
        ['missing-process', {traceEvents: [{ph: 'i', name: 'bad', tid: 1, ts: 0}]}, 'Chrome event requires an integer pid'],
        ['long-name', {traceEvents: [{ph: 'i', name: 'x'.repeat(4097), pid: 1, tid: 1, ts: 0}]}, 'Trace field exceeds its size limit'],
        ['large-arguments', {traceEvents: [{ph: 'i', name: 'bad', pid: 1, tid: 1, ts: 0, args: {data: 'x'.repeat(32769)}}]}, 'Chrome event arguments are too large'],
        ['future-goo-version', {...exported, goo: {...exported.goo, format: 'goo.profiler/2'}}, 'Unsupported Goo trace file version'],
    ];
    for (const [name, data, error] of badCases) {
        const filename = path.join(output, name + '.json');
        await writeFile(filename, JSON.stringify(data));
        await traceFile(offline, 'Import', filename, error);
        assert(status(await snapshot(offline)).includes('Imported external-subset.json'), 'Failed import replaced the retained trace');
    }
    const infinitePath = path.join(output, 'nonfinite.json');
    await writeFile(infinitePath, '{"traceEvents":[{"ph":"X","name":"bad","pid":1,"tid":1,"ts":1e400,"dur":1}]}');
    await traceFile(offline, 'Import', infinitePath, 'Chrome timestamp or duration is out of range');
    const eventLimitPath = path.join(output, 'too-many-events.json');
    await writeFile(eventLimitPath, '{"traceEvents":[' + Array(524289).fill('{}').join(',') + ']}');
    await traceFile(offline, 'Import', eventLimitPath, 'exceeds 524288 events');
    await rm(eventLimitPath);
    const oversizedPath = path.join(tmpdir(), `goo-oversized-trace-${process.pid}.json`);
    try {
        const file = await open(oversizedPath, 'w');
        await file.truncate(256 * 1024 * 1024 + 1);
        await file.close();
        await traceFile(offline, 'Import', oversizedPath, 'Trace file exceeds the 256 MiB limit');
    } finally { await rm(oversizedPath, {force: true}); }
    await click(offline, 'profiler-file-cancel');
    const retainedPath = path.join(output, 'retained-after-errors.json');
    await traceFile(offline, 'Export', retainedPath);
    const retained = JSON.parse(await readFile(retainedPath, 'utf8'));
    assert.deepEqual(retained.traceEvents.filter(event => event.goo).map(event => event.goo), externalRecords,
        'Invalid import corrupted the previous trace');
    console.log('profiler-files: chrome_subset=verified crossing_slices=partitioned flow_ids=preserved invalid_imports=atomic file_event_name_limits=verified');
    console.log('profiler-ui: real_gallery=verified busy=connected owners=8 overview=verified gpu_counter_lane=verified selection=stable clipped_range=verified scrolling=verified tables=verified screenshots=9 clear=verified');
} catch (error) {
    const inspector = children[1]?.pid;
    if (inspector) {
        try { await writeFile(path.join(output, 'failure-snapshot.json'), JSON.stringify(await snapshot(inspector))); } catch {}
    }
    throw error;
} finally {
    for (const child of children.reverse()) child.kill('SIGTERM');
    for (const proxy of proxies) proxy.close();
}
