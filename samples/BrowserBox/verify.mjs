import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

if (!process.env.WAYLAND_DISPLAY || process.env.WAYLAND_DISPLAY === 'wayland-0') {
    throw new Error('Run this fixture inside a private compositor');
}
const [bundle, run, output] = process.argv.slice(2).map(value => path.resolve(value));
const counter = process.argv[5];
const counterWidth = counter === 'gsharp' || counter === 'readme' ? 360 : 640;
const counterHeight = counter === 'gsharp' || counter === 'readme' ? 220 : 480;
const clickY = counter === 'gsharp' || counter === 'fsharp' ? 84 : counter === 'readme' ? 26 : 76;
fs.mkdirSync(run, { recursive: true });
fs.mkdirSync(output, { recursive: true });
for (const name of ['cache', 'config', 'data']) fs.mkdirSync(path.join(run, name), { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(bundle, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(bundle + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404); response.end(); return;
    }
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const environment = { ...process.env, XDG_CACHE_HOME: path.join(run, 'cache'),
    XDG_CONFIG_HOME: path.join(run, 'config'), XDG_DATA_HOME: path.join(run, 'data') };
delete environment.__EGL_VENDOR_LIBRARY_FILENAMES;
const flags = ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-webgpu',
    '--ozone-platform=wayland', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(run, 'profile')}`,
    ...JSON.parse(process.env.GOO_BROWSER_FLAGS ?? '[]'), 'about:blank'];
const browser = spawn(process.env.CHROMIUM ?? '/usr/bin/chromium', flags,
    { env: environment, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const events = [];
const requests = new Map();
let stderr = '', socket, nextId = 0;
browser.stderr.on('data', chunk => stderr += chunk);
async function call(method, params = {}) {
    const id = ++nextId;
    const response = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return response;
}
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}
async function until(predicate, label) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const result = await predicate();
        if (result) return result;
        await pause(100);
    }
    throw new Error(`Timed out: ${label}`);
}
const state = () => evaluate(`globalThis.gooBrowser ? ({ frames: gooBrowser.frames, submissions: gooBrowser.submissions,
    renderInteropCalls: gooBrowser.renderInteropCalls, raf: gooBrowser.raf, timer: gooBrowser.timer,
    primitiveCount: gooBrowser.primitiveCount, width: gooBrowser.canvas.width, height: gooBrowser.canvas.height,
    error: gooBrowser.error, adapter: gooBrowser.adapter }) : null`);
async function capture(name) {
    await evaluate('gooBrowser.device.queue.onSubmittedWorkDone()');
    const canvasImage = await evaluate("gooBrowser.canvas.toDataURL('image/png')");
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(canvasImage.split(',')[1], 'base64'));
    const image = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, name + '-page.png'), Buffer.from(image.data, 'base64'));
}
try {
    const endpoint = await until(async () => {
        const active = path.join(run, 'profile', 'DevToolsActivePort');
        return fs.existsSync(active) ? Number(fs.readFileSync(active, 'utf8').split('\n')[0]) : null;
    }, 'Chromium CDP');
    const version = await (await fetch(`http://127.0.0.1:${endpoint}/json/version`)).json();
    const gpuSocket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { gpuSocket.onopen = resolve; gpuSocket.onerror = reject; });
    const gpuInfo = await new Promise((resolve, reject) => {
        gpuSocket.onmessage = event => {
            const message = JSON.parse(event.data);
            if (message.id === 1) message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
        };
        gpuSocket.send(JSON.stringify({ id: 1, method: 'SystemInfo.getInfo' }));
    });
    gpuSocket.close();
    fs.writeFileSync(path.join(output, 'gpu.json'), JSON.stringify({ chromium: version.Browser, ...gpuInfo }, null, 2));
    const targets = await (await fetch(`http://127.0.0.1:${endpoint}/json`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const request = requests.get(message.id);
            requests.delete(message.id);
            if (message.error) request.reject(new Error(JSON.stringify(message.error)));
            else request.resolve(message.result);
        } else events.push(message);
    };
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: counter ? counterWidth : 800,
        height: counter ? counterHeight : 600, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await until(async () => (await state())?.submissions > 0, 'Goo WebGPU submission');
    await pause(400);
    let initial = await state();
    if (counter === 'fsharp') {
        await capture('counter-initial-10');
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 50, y: 112, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 50, y: 112, button: 'left', clickCount: 1 });
        await until(async () => (await state()).submissions > initial.submissions, 'community counter reset');
        await pause(150);
        initial = await state();
    }
    await capture(counter ? 'counter-0' : 'box');
    await pause(counter ? 10000 : 700);
    const idle = await state();
    if (initial.error || idle.error || idle.frames !== initial.frames || idle.raf || idle.timer) {
        throw new Error(`Idle frame scheduling failed: ${JSON.stringify({ initial, idle })}`);
    }
    const adapter = await evaluate(`(async () => { const adapter = await navigator.gpu.requestAdapter();
        return { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device,
            description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter ?? adapter.isFallbackAdapter }; })()`);
    if (adapter.isFallbackAdapter !== false || /swiftshader|llvmpipe|lavapipe/i.test(JSON.stringify(adapter))) {
        throw new Error(`A real GPU is required: ${JSON.stringify(adapter)}`);
    }
    if (counter) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 50, y: clickY });
        await pause(250);
        await capture('counter-hover');
        for (let index = 0; index < 3; index++) {
            const before = await state();
            await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 50, y: clickY, button: 'left', clickCount: 1 });
            await pause(100);
            if (index === 0) await capture('counter-pressed');
            await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 50, y: clickY, button: 'left', clickCount: 1 });
            await until(async () => (await state()).submissions > before.submissions, 'counter update');
        }
    } else {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 300, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 300, button: 'left', clickCount: 1 });
        await until(async () => (await state()).submissions > initial.submissions, 'Cell click update');
    }
    await pause(150);
    const clicked = await state();
    await capture(counter ? 'counter-3' : 'box-clicked');
    if (counter) {
        await pause(10000);
        const finalIdle = await state();
        if (finalIdle.frames !== clicked.frames || finalIdle.raf || finalIdle.timer || finalIdle.error
            || finalIdle.renderInteropCalls !== finalIdle.submissions) {
            throw new Error(`Counter idle or interop failed: ${JSON.stringify({ clicked, finalIdle })}`);
        }
        fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ counter, flags, adapter,
            initial, idle, clicked, finalIdle, events }, null, 2));
        console.log(JSON.stringify({ counter, adapter, initial, idle, clicked, finalIdle }));
    } else {
    await call('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
    await until(async () => { const value = await state(); return value.width === 1000 && value.height === 700
        && value.submissions > clicked.submissions; }, 'canvas resize');
    await pause(200);
    const resized = await state();
    await capture('box-resized');
    await pause(700);
    const resizedIdle = await state();
    if (resizedIdle.frames !== resized.frames || resizedIdle.raf || resizedIdle.timer || resizedIdle.error) {
        throw new Error('Resized canvas did not become idle');
    }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ flags, adapter, initial, idle, clicked,
        resized, resizedIdle, events }, null, 2));
    console.log(JSON.stringify({ adapter, initial, idle, clicked, resized, resizedIdle }));
    }
} catch (error) {
    const current = socket ? await state() : null;
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), state: current, events }, null, 2));
    if (socket) {
        const image = await call('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(output, 'failure-page.png'), Buffer.from(image.data, 'base64'));
    }
    throw error;
} finally {
    socket?.close();
    try { process.kill(-browser.pid, 'SIGTERM'); } catch { }
    await new Promise(resolve => browser.exitCode !== null ? resolve() : browser.once('exit', resolve));
    fs.writeFileSync(path.join(output, 'chromium.log'), stderr);
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(run, { recursive: true, force: true });
}
