import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

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
    const nodes = await snapshot(pid);
    const node = nodes.find(item => item.key === key);
    assert(node?.actionable, 'Missing actionable control ' + key);
    return request(['input', 'click', '--pid', String(pid), '--target', node.target]);
}
async function waitSnapshot(pid, predicate) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        const nodes = await snapshot(pid);
        if (predicate(nodes)) return nodes;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Profiler UI state did not settle');
}
const content = nodes => nodes.filter(node => node.content).map(node => node.content).join('\n');
const summary = nodes => nodes.find(node => node.key === 'profiler-summary')?.content ?? '';
async function capture(pid, name) {
    await command(['capture', '--pid', String(pid), '--output', path.join(output, name + '.png')]);
}

try {
    const gallery = launch('apps/Goo.Gallery/bin/Release/net10.0/Goo.Gallery.dll', 'gallery');
    await snapshot(gallery);
    const inspector = launch('apps/Goo.DevTools/bin/Release/net10.0/Goo.DevTools.dll', 'devtools', ['--pid', String(gallery)]);
    await snapshot(inspector);
    await click(inspector, 'tab-profiler');
    let nodes = await waitSnapshot(inspector, data => content(data).includes('Record a real target trace'));
    assert.equal(nodes.find(node => node.key === 'profiler-record').disabled, false);
    await click(inspector, 'profiler-record');
    nodes = await waitSnapshot(inspector, data => content(data).includes('Recording /') && summary(data).includes('vulkan.live.requirements'));
    for (const owner of ['Unknown', 'LayerTarget', 'GlyphAtlas', 'PathAtlas', 'ClipAtlas', 'Staging', 'Image', 'Buffer']) {
        assert(summary(nodes).includes('vulkan.live.requirements / ' + owner + ' /'), 'Owner name mapping lost ' + owner);
    }
    for (const key of ['rail-item-1', 'rail-item-7', 'rail-item-5']) await click(gallery, key);
    await capture(gallery, 'gallery-during-recording');
    await click(inspector, 'profiler-record');
    nodes = await waitSnapshot(inspector, data => content(data).includes('Complete /'));
    assert(!content(nodes).includes('PARTIAL'), 'Normal recording was marked partial');
    await click(inspector, 'profiler-fit');
    nodes = await snapshot(inspector);
    assert(summary(nodes).includes('GPU elapsed (unaligned):'), 'GPU elapsed counters are missing from the GPU lane');
    assert(summary(nodes).includes('Image / LayerTarget:'), 'Image resource kind mapping was lost');
    await capture(inspector, 'timeline');
    const framePlot = nodes.find(node => node.key.startsWith('plot-FramesFramewindow-'));
    assert(framePlot, 'No correlated frame track');
    await request(['input', 'click', '--pid', String(inspector), '--target', framePlot.target]);
    nodes = await snapshot(inspector);
    const details = nodes.find(node => node.key === 'profiler-details').content;
    assert.match(details, /pump [1-9][0-9]* \/ frame/, 'Frame details lost pump correlation');
    assert.match(details, /ticks [0-9]+ to [0-9]+/, 'Frame details lost exact ticks');
    await click(inspector, 'profiler-zoom-selection');
    nodes = await snapshot(inspector);
    const selectedSummary = summary(nodes);
    await click(inspector, 'profiler-pan-right');
    nodes = await snapshot(inspector);
    assert.equal(summary(nodes), selectedSummary, 'Panning changed the selected range');
    await capture(inspector, 'selected-frame');
    await click(inspector, 'profiler-fit');
    for (const key of ['profiler-category-Frames', 'profiler-category-CPU', 'profiler-category-Queue', 'profiler-category-GPU']) {
        await click(inspector, key);
    }
    await click(inspector, 'profiler-owner-stack');
    await capture(inspector, 'memory');
    await click(inspector, 'profiler-category-Memory');
    await click(inspector, 'profiler-lifetimes');
    await capture(inspector, 'resources');
    nodes = await snapshot(inspector);
    await writeFile(path.join(output, 'final-snapshot.json'), JSON.stringify(nodes));
    await click(inspector, 'profiler-clear');
    nodes = await snapshot(inspector);
    assert(content(nodes).includes('Record a real target trace'), 'Clear retained the previous trace');
    console.log('profiler-ui: real_gallery=verified owners=8 gpu_counter_lane=verified resource_kinds=verified selection=stable screenshots=5 clear=verified');
} finally {
    for (const child of children.reverse()) child.kill('SIGTERM');
}
