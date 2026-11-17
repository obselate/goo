export function createBrowserImports(getMemory) {
    const hosts = new Map();
    let nextHost = 1;
    return {
        async initialize(canvasId, vertex, solid, border, textVertex, textFragment, frame, resize, pointer, visibility) {
            if (!navigator.gpu) throw new Error('WebGPU is unavailable');
            const canvas = document.getElementById(canvasId);
            if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Canvas not found: ${canvasId}`);
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) throw new Error('No WebGPU adapter is available');
            const device = await adapter.requestDevice();
            const context = canvas.getContext('webgpu');
            if (!context) throw new Error('Cannot create the WebGPU canvas context');
            const format = navigator.gpu.getPreferredCanvasFormat();
            device.pushErrorScope('validation');
            const viewportLayout = device.createBindGroupLayout({ entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', minBindingSize: 16 } }
            ] });
            const primitiveLayout = device.createBindGroupLayout({ entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'read-only-storage', minBindingSize: 128 } }
            ] });
            const atlasLayout = device.createBindGroupLayout({ entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'sint' } }
            ] });
            const layout = device.createPipelineLayout({ bindGroupLayouts: [
                viewportLayout, device.createBindGroupLayout({ entries: [] }), primitiveLayout
            ] });
            const textLayout = device.createPipelineLayout({ bindGroupLayouts: [viewportLayout, atlasLayout, primitiveLayout] });
            const modules = [vertex, solid, border, textVertex, textFragment].map(code => device.createShaderModule({ code }));
            for (const shader of modules) {
                const info = await shader.getCompilationInfo();
                const errors = info.messages.filter(message => message.type === 'error');
                if (errors.length) {
                    device.destroy();
                    throw new Error(errors.map(message => `${message.lineNum}:${message.linePos}: ${message.message}`).join('\n'));
                }
            }
            const pipelines = await Promise.all([1, 2, 4].map(index => device.createRenderPipelineAsync({
                layout: index === 4 ? textLayout : layout,
                vertex: { module: modules[index === 4 ? 3 : 0], entryPoint: 'main' },
                fragment: { module: modules[index], entryPoint: 'main', targets: [{
                    format, blend: {
                        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }] },
                primitive: index === 4 ? { topology: 'triangle-list' } : { topology: 'triangle-strip', stripIndexFormat: 'uint32' }
            })));
            pipelines[3] = pipelines.pop();
            const validation = await device.popErrorScope();
            if (validation) { device.destroy(); throw new Error(validation.message); }
            const uniforms = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            const viewportGroup = device.createBindGroup({ layout: viewportLayout,
                entries: [{ binding: 0, resource: { buffer: uniforms } }] });
            const id = nextHost++;
            const state = { canvas, device, context, format, pipelines, uniforms, viewportGroup, primitiveLayout, atlasLayout,
                atlases: new Map(),
                primitives: null, primitiveGroup: null, capacity: 0, frame, raf: 0, timer: 0, deadline: Infinity,
                frames: 0, submissions: 0, renderInteropCalls: 0, scheduled: 0, error: null,
                adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device,
                    description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter ?? adapter.isFallbackAdapter },
                disposed: false };
            hosts.set(id, state);
            const fail = error => {
                state.error = String(error.message ?? error);
                cancel(state);
                visibility(false);
                console.error('Goo WebGPU:', state.error);
            };
            device.addEventListener('uncapturederror', event => fail(event.error));
            device.lost.then(info => { if (!state.disposed) fail(new Error(`WebGPU device lost: ${info.reason}: ${info.message}`)); });
            const measure = () => {
                const rect = canvas.getBoundingClientRect();
                const width = Math.max(0, Math.round(rect.width));
                const height = Math.max(0, Math.round(rect.height));
                const pixelWidth = Math.max(1, Math.round(width * devicePixelRatio));
                const pixelHeight = Math.max(1, Math.round(height * devicePixelRatio));
                if (pixelWidth > device.limits.maxTextureDimension2D || pixelHeight > device.limits.maxTextureDimension2D) {
                    fail(new Error('The canvas exceeds the WebGPU device size limit'));
                    return;
                }
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
                context.configure({ device, format, alphaMode: 'premultiplied' });
                resize(width, height, devicePixelRatio);
            };
            state.observer = new ResizeObserver(measure);
            state.observer.observe(canvas);
            state.visibility = () => visibility(!document.hidden);
            document.addEventListener('visibilitychange', state.visibility);
            state.pointer = event => {
                if (event.button > 0 || event.pointerType !== 'mouse') return;
                const rect = canvas.getBoundingClientRect();
                const kinds = { pointermove: 0, pointerdown: 1, pointerup: 2, pointercancel: 3 };
                if (event.type === 'pointerdown') canvas.setPointerCapture(event.pointerId);
                pointer(kinds[event.type], event.clientX - rect.left, event.clientY - rect.top);
                event.preventDefault();
            };
            for (const kind of ['pointermove', 'pointerdown', 'pointerup', 'pointercancel']) canvas.addEventListener(kind, state.pointer);
            measure();
            globalThis.gooBrowser = state;
            return id;
        },
        schedule(id, delaySeconds) {
            const state = hosts.get(id);
            if (!state || state.disposed || state.error) return;
            if (!Number.isFinite(delaySeconds) || document.hidden) { cancel(state); return; }
            const deadline = performance.now() + Math.max(0, delaySeconds * 1000);
            if ((state.raf || state.timer) && deadline >= state.deadline) return;
            cancel(state);
            state.deadline = deadline;
            const request = () => {
                state.timer = 0;
                state.raf = requestAnimationFrame(timestamp => {
                    state.raf = 0;
                    state.deadline = Infinity;
                    state.frames++;
                    state.frame(timestamp);
                });
                state.scheduled++;
            };
            if (delaySeconds <= 0) request();
            else state.timer = setTimeout(request, delaySeconds * 1000);
        },
        submit(id, pointer, count, atlasPointer, atlasCount) {
            const state = hosts.get(id);
            if (!state || state.disposed) throw new Error('The WebGPU host is disposed');
            if (state.error) throw new Error(state.error);
            const { device } = state;
            const bytes = count * 128;
            if (bytes > device.limits.maxStorageBufferBindingSize) throw new Error('Browser primitive buffer exceeds device limits');
            if (bytes > state.capacity) {
                state.primitives?.destroy();
                state.capacity = Math.max(128, bytes);
                state.primitives = device.createBuffer({ size: state.capacity,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                state.primitiveGroup = device.createBindGroup({ layout: state.primitiveLayout,
                    entries: [{ binding: 0, resource: { buffer: state.primitives } }] });
            }
            const memory = getMemory();
            const atlases = new Uint32Array(memory, atlasPointer, atlasCount * 4);
            for (let index = 0; index < atlasCount; index++) {
                const slot = atlases[index * 4], version = atlases[index * 4 + 1];
                const address = atlases[index * 4 + 2], length = atlases[index * 4 + 3];
                let atlas = state.atlases.get(slot);
                if (atlas?.version !== version) {
                    atlas?.texture.destroy();
                    const texture = device.createTexture({ size: [1024, 128], format: 'rgba16sint',
                        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
                    atlas = { version, texture, uploaded: 0, group: device.createBindGroup({ layout: state.atlasLayout,
                        entries: [{ binding: 0, resource: texture.createView() }] }) };
                    state.atlases.set(slot, atlas);
                }
                let offset = atlas.uploaded;
                while (offset < length) {
                    const column = (offset / 8) % 1024;
                    const width = Math.min(1024 - column, (length - offset) / 8);
                    device.queue.writeTexture({ texture: atlas.texture, origin: [column, Math.floor(offset / 8192)] },
                        new Uint8Array(memory, address + offset, width * 8), {}, [width, 1]);
                    offset += width * 8;
                }
                atlas.uploaded = length;
                atlas.frame = state.submissions;
            }
            for (const [slot, atlas] of state.atlases) {
                if (atlas.frame !== state.submissions) { atlas.texture.destroy(); state.atlases.delete(slot); }
            }
            device.queue.writeBuffer(state.uniforms, 0, new Uint8Array(memory, pointer, 16));
            if (bytes) device.queue.writeBuffer(state.primitives, 0, new Uint8Array(memory, pointer + 16, bytes));
            const commands = new Uint32Array(memory, pointer + 16 + bytes, count * 2);
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({ colorAttachments: [{
                view: state.context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
            }] });
            pass.setBindGroup(0, state.viewportGroup);
            if (count) pass.setBindGroup(2, state.primitiveGroup);
            let pipeline = -1;
            for (let index = 0; index < count; index++) {
                const kind = commands[index * 2];
                if (kind === 2) continue;
                if (kind !== pipeline) { pass.setPipeline(state.pipelines[kind]); pipeline = kind; }
                if (kind === 3) pass.setBindGroup(1, state.atlases.get(commands[index * 2 + 1]).group);
                pass.draw(kind === 3 ? 6 : 4, 1, 0, index);
            }
            pass.end();
            device.queue.submit([encoder.finish()]);
            state.submissions++;
            state.renderInteropCalls++;
            state.primitiveCount = count;
        },
        dispose(id) {
            const state = hosts.get(id);
            if (!state) return;
            state.disposed = true;
            cancel(state);
            state.observer.disconnect();
            document.removeEventListener('visibilitychange', state.visibility);
            for (const kind of ['pointermove', 'pointerdown', 'pointerup', 'pointercancel']) state.canvas.removeEventListener(kind, state.pointer);
            state.context.unconfigure();
            state.primitives?.destroy();
            state.uniforms.destroy();
            for (const atlas of state.atlases.values()) atlas.texture.destroy();
            state.device.destroy();
            hosts.delete(id);
        }
    };
}

function cancel(state) {
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.timer) clearTimeout(state.timer);
    state.raf = 0;
    state.timer = 0;
    state.deadline = Infinity;
}
