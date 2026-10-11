const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PARENT_DIR = path.resolve(__dirname, '..');
const NEXT_BIN = path.join(PARENT_DIR, 'node_modules', '.bin', 'next.cmd');
const HEALTH_URL = 'http://localhost:3000';
const CHECK_INTERVAL = 2000;
const MAX_LOG_LINES = 1200;

let mainWindow = null;
let serverChild = null;
let logLines = [];
let checkTimer = null;
let quitting = false;

function pushLog(line) {
  const clean = line.replace(/\u001b\[[0-9;]*m/g, '').replace(/\r/g, '');
  if (!clean.trim()) return;
  logLines.push(clean);
  if (logLines.length > MAX_LOG_LINES) logLines.splice(0, logLines.length - MAX_LOG_LINES);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server:log', clean);
  }
}

function makeLineSplitter(prefix) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) pushLog(prefix + line);
  };
}

function isServerUp() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function updateStatus(up) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server:status', { online: up, at: Date.now() });
  }
}

function scheduleChecks() {
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(async () => {
    updateStatus(await isServerUp());
  }, CHECK_INTERVAL);
}

function startServer() {
  if (serverChild) return { started: false, reason: 'already-running' };
  try {
    const child = spawn(NEXT_BIN, ['start', '-p', '3000'], {
      cwd: PARENT_DIR,
      shell: true,
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'production', PORT: '3000' }
    });
    serverChild = child;

    pushLog('[engine] launching: next start -p 3000');
    child.stdout.on('data', makeLineSplitter(''));
    child.stderr.on('data', makeLineSplitter('[stderr] '));

    child.on('error', (err) => {
      pushLog('[engine] spawn error: ' + err.message);
      if (serverChild === child) serverChild = null;
    });
    child.on('exit', (code, signal) => {
      pushLog('[engine] process exited' + (code !== null ? ' (code ' + code + ')' : '') + (signal ? ' (signal ' + signal + ')' : ''));
      if (serverChild === child) serverChild = null;
    });
    return { started: true };
  } catch (err) {
    pushLog('[engine] error: ' + err.message);
    return { started: false, error: err.message };
  }
}

function stopServer() {
  return new Promise((resolve) => {
    const child = serverChild;
    if (!child || !child.pid) return resolve({ stopped: false });
    serverChild = null;
    pushLog('[engine] stop requested...');
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      killer.on('error', () => child.kill('SIGTERM'));
      killer.on('exit', () => {
        pushLog('[engine] process terminated');
        resolve({ stopped: true });
      });
      child.kill();
    } else {
      child.kill('SIGTERM');
      child.once('exit', () => {
        pushLog('[engine] process terminated');
        resolve({ stopped: true });
      });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#020617',
    title: 'WRECKERAI AGENCY OS — Launcher',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('did-finish-load', async () => {
    updateStatus(await isServerUp());
    if (!(await isServerUp())) startServer();
  });
}

ipcMain.handle('status:check', async () => ({ online: await isServerUp() }));
ipcMain.handle('server:start', () => startServer());
ipcMain.handle('server:stop', () => stopServer());
ipcMain.handle('server:restart', async () => {
  await stopServer();
  return startServer();
});
ipcMain.handle('server:logs', () => logLines.slice());
ipcMain.handle('server:open', () => shell.openExternal(HEALTH_URL));

app.whenReady().then(() => {
  app.setAppUserModelId('com.wreckerai.launcher');
  createWindow();
  scheduleChecks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (quitting || !serverChild || !serverChild.pid) return;
  event.preventDefault();
  quitting = true;
  const pid = serverChild.pid;
  serverChild = null;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
    killer.on('exit', () => app.quit());
    killer.on('error', () => app.quit());
  } else {
    serverChild.kill('SIGTERM');
    app.exit(0);
  }
});