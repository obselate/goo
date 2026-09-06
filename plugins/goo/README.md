# Goo agent plugin

Standalone G# Goo authoring skill plus six stdio MCP tools: context, search, read, starter, snapshot, and capture. Requires Python 3.11+, uv, and .NET 10 for applications. The server uses the [official MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x).

Install the runtime CLI with `dotnet tool install --global Goo.DevTools --version 0.5.0`. `GOO_CLI` can select an executable or built Goo.DevTools.Cli.dll. Set `GOO_DEVTOOLS_DIR` in both the app and MCP server environments if using a custom descriptor directory.

The generated starter adds an explicit G# source Watch item. The bundled guides and official starter have commit and per-file SHA-256 provenance in `reference/manifest.json`. Pass `repository` to tools or set `GOO_SOURCE_ROOT` to read current checkout docs. The bundle is a reference snapshot, not a claim that a dirty checkout equals its HEAD commit.

Run any MCP client against:

```sh
uv run --project /absolute/path/to/goo --locked python /absolute/path/to/goo/scripts/server.py
```

The local MCP manifest uses the absolute source path. Keep this source folder available after installation. On another machine or after moving it, run `python3 scripts/configure.py` before installing or reinstalling. The tested Codex build did not expand plugin-root placeholders in MCP arguments. No API key or hosted model service is required. Application processes remain under the caller's control. Runtime tools require an explicit PID and only request snapshot or capture.

Refresh the bundle with `python3 scripts/sync_docs.py /path/to/goo-checkout`. Validate the MCP workflow with `uv run --locked python scripts/verify.py`. The integration check generates a temporary consumer, builds and launches it, inspects its real tree and PNG, and checks a live watch edit.

The local plugin manifest follows the [Codex plugin packaging format](https://developers.openai.com/plugins/build/plugins). Start a new Codex thread after installation to load its skill and MCP tools.

Verified on .NET SDK 10.0.302, G# SDK 0.4.1 and Goo 0.5.0: MCP handshake and all six tools, generated starter build, real Vulkan PNG capture, method delta application without automatic Goo UI invalidation, GSHR1001 for an added function, and source-edit restart with a clean build plus explicit Watch item. The final unattended run is `/tmp/goo-agent-e2e-k9flf08g/result.json`. See `skills/goo-authoring/references/watch.md` for the exact workaround and limits.

Local patched G# runtime and Goo now pass state-preserving method-edit reload tests across two windows, with diagnostics on and off. These patches are separate from the published-package check above. The skill documents structural-edit restarts, initialization limits and exact verification scope. Run-versus-watch performance parity is unmeasured: use `dotnet run` by default and explicitly offer watch unless comparable project measurements establish parity or the user already selected it. This also applies to `goo dev`, which watches unless passed `--no-watch`.
