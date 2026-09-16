const vscode = require('vscode');
const childProcess = require('child_process');
const readline = require('readline');
const path = require('path');

let output;
let status;
let attachProcess;
let devTerminal;
let statusTimer;
let lastSource;

function configuration() {
  return vscode.workspace.getConfiguration('goo');
}

function cliPath() {
  return configuration().get('cliPath', 'goo');
}

async function projectPath() {
  const configured = configuration().get('project', '');
  if (configured) {
    return path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(), configured);
  }
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    throw new Error('Open a Goo workspace or set goo.project.');
  }
  const files = await vscode.workspace.findFiles('**/*.{gsproj,csproj}', '**/{bin,obj}/**', 10);
  if (files.length === 0) {
    throw new Error('No .gsproj or .csproj file was found. Set goo.project.');
  }
  return files[0].fsPath;
}

function shellQuote(value) {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`Goo DevTools: ${message}`);
  output?.appendLine(`[error] ${message}`);
}

function writeLine(line) {
  output?.appendLine(line);
  const message = parseJson(line);
  if (!message) {
    return;
  }
  const source = message.source || message.sourceLocation || message.payload?.source;
  if (!source) {
    return;
  }
  const file = source.path || source.file || source.filePath;
  if (!file) {
    return;
  }
  lastSource = {
    file,
    line: Number(source.line || source.lineNumber || 1),
    column: Number(source.column || source.columnNumber || 1)
  };
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function runCli(args, onLine) {
  return new Promise((resolve, reject) => {
    const configuredInspector = configuration().get('inspectorPath', '');
    const environment = { ...process.env };
    if (configuredInspector) {
      environment.GOO_DEVTOOLS_INSPECTOR = configuredInspector;
    }
    const processHandle = childProcess.spawn(cliPath(), args, {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
      env: environment,
      windowsHide: true
    });
    const stdout = readline.createInterface({ input: processHandle.stdout });
    const stderr = readline.createInterface({ input: processHandle.stderr });
    stdout.on('line', line => onLine(line));
    stderr.on('line', line => onLine(`[stderr] ${line}`));
    processHandle.on('error', reject);
    processHandle.on('close', code => resolve(code ?? 1));
  });
}

async function start() {
  try {
    const project = await projectPath();
    const args = ['dev', '--watch', '--project', project];
    if (configuration().get('launchInspector', true)) {
      args.push('--inspector');
    }
    const command = [shellQuote(cliPath()), ...args.map(shellQuote)].join(' ');
    if (!devTerminal) {
      devTerminal = vscode.window.createTerminal({ name: 'Goo DevTools' });
    }
    devTerminal.show(true);
    devTerminal.sendText(command, true);
    status.text = '$(sync~spin) Goo starting';
    status.tooltip = project;
    await refreshStatus();
  } catch (error) {
    showError(error);
  }
}

async function attach() {
  detach();
  output.show(true);
  status.text = '$(plug) Goo attaching';
  attachProcess = childProcess.spawn(cliPath(), ['attach', '--latest', '--json'], {
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
    env: process.env,
    windowsHide: true
  });
  const stdout = readline.createInterface({ input: attachProcess.stdout });
  const stderr = readline.createInterface({ input: attachProcess.stderr });
  stdout.on('line', writeLine);
  stderr.on('line', line => writeLine(`[stderr] ${line}`));
  attachProcess.on('error', showError);
  attachProcess.on('close', code => {
    attachProcess = undefined;
    status.text = code === 0 ? '$(circle-slash) Goo detached' : '$(warning) Goo attach failed';
    refreshStatus();
  });
}

function detach() {
  if (attachProcess) {
    attachProcess.kill();
    attachProcess = undefined;
  }
  if (status) {
    status.text = '$(circle-slash) Goo detached';
  }
}

async function openInspector() {
  try {
    output.show(true);
    const code = await runCli(['attach', '--latest', '--inspector', '--once', '--json'], writeLine);
    if (code !== 0) {
      vscode.window.showErrorMessage('Goo DevTools could not launch the inspector. Run Goo: Doctor for details.');
    }
  } catch (error) {
    showError(error);
  }
}

async function capture() {
  try {
    const target = await vscode.window.showSaveDialog({
      saveLabel: 'Capture Goo frame',
      filters: { PNG: ['png'] },
      defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(), 'goo-frame.png'))
    });
    if (!target) {
      return;
    }
    output.show(true);
    const code = await runCli(['capture', '--latest', '--output', target.fsPath], writeLine);
    if (code === 0) {
      vscode.window.showInformationMessage(`Goo frame captured: ${target.fsPath}`);
    }
  } catch (error) {
    showError(error);
  }
}

async function openSource() {
  try {
    let location = lastSource;
    if (!location) {
      const selected = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Open Goo source' });
      if (!selected || selected.length === 0) {
        return;
      }
      location = { file: selected[0].fsPath, line: 1, column: 1 };
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(location.file));
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(Math.max(0, location.line - 1), Math.max(0, location.column - 1));
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  } catch (error) {
    showError(error);
  }
}

async function restartHotReload() {
  try {
    const project = await projectPath();
    if (!devTerminal) {
      devTerminal = vscode.window.createTerminal({ name: 'Goo DevTools' });
    }
    devTerminal.show(true);
    devTerminal.sendText([shellQuote(cliPath()), 'dev', '--watch', '--project', shellQuote(project)].join(' '), true);
    status.text = '$(sync~spin) Goo restarting';
  } catch (error) {
    showError(error);
  }
}

async function doctor() {
  try {
    output.show(true);
    await runCli(['doctor', '--json'], writeLine);
    await refreshStatus();
  } catch (error) {
    showError(error);
  }
}

async function refreshStatus() {
  try {
    const lines = [];
    const code = await runCli(['doctor', '--json'], line => lines.push(line));
    const result = lines.map(parseJson).find(value => value && Array.isArray(value.checks));
    const endpoint = result?.checks?.find(check => check.Name === 'endpoint' || check.name === 'endpoint');
    if (endpoint && endpoint.Ok !== false && endpoint.ok !== false) {
      status.text = '$(plug) Goo attached';
      status.tooltip = endpoint.Detail || endpoint.detail || 'Live Goo endpoint';
    } else if (code === 0) {
      status.text = '$(circle-outline) Goo ready';
      status.tooltip = 'No live Goo endpoint';
    } else {
      status.text = '$(warning) Goo setup';
      status.tooltip = 'Run Goo: Doctor';
    }
  } catch (error) {
    status.text = '$(warning) Goo unavailable';
    status.tooltip = error instanceof Error ? error.message : String(error);
  }
}

function activate(context) {
  output = vscode.window.createOutputChannel('Goo DevTools');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'goo.attach';
  status.text = '$(circle-outline) Goo';
  status.show();
  context.subscriptions.push(output, status);
  context.subscriptions.push(vscode.commands.registerCommand('goo.start', start));
  context.subscriptions.push(vscode.commands.registerCommand('goo.attach', attach));
  context.subscriptions.push(vscode.commands.registerCommand('goo.detach', detach));
  context.subscriptions.push(vscode.commands.registerCommand('goo.openInspector', openInspector));
  context.subscriptions.push(vscode.commands.registerCommand('goo.capture', capture));
  context.subscriptions.push(vscode.commands.registerCommand('goo.openSource', openSource));
  context.subscriptions.push(vscode.commands.registerCommand('goo.restartHotReload', restartHotReload));
  context.subscriptions.push(vscode.commands.registerCommand('goo.doctor', doctor));
  const seconds = Math.max(1, configuration().get('statusPollSeconds', 5));
  statusTimer = setInterval(refreshStatus, seconds * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(statusTimer) });
  refreshStatus();
}

function deactivate() {
  detach();
  if (devTerminal) {
    devTerminal.dispose();
    devTerminal = undefined;
  }
  if (statusTimer) {
    clearInterval(statusTimer);
  }
}

module.exports = { activate, deactivate };
