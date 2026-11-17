import { dotnet } from './_framework/dotnet.js';
import { createBrowserImports } from './goo-browser.js';

const runtime = await dotnet.create();
runtime.setModuleImports('goo-browser', createBrowserImports(() => runtime.Module.HEAPU8.buffer));
await runtime.runMain();
