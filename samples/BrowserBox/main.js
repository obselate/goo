import { dotnet } from './_framework/dotnet.js';
import { createBrowserImports } from './goo-wasm.js';

const runtime = await dotnet.create();
runtime.setModuleImports('goo-wasm', createBrowserImports(() => runtime.Module.HEAPU8.buffer));
await runtime.runMain();
