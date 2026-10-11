# WRECKERAI AGENCY OS — Desktop Launcher

A standalone Electron launcher that boots and supervises the Next.js production
server for WreckerAI Agency OS and opens it in your browser.

## What it does

- Shows a premium dark launcher UI (OLED theme, emerald accent).
- Auto-detects whether `http://localhost:3000` is up (checked every 2s).
- If the server is down, spawns the Next.js production server from the parent
  project folder and streams its stdout/stderr into the console panel.
- **OPEN WRECKERAI AGENCY OS** opens the dashboard in your default browser.
- START / STOP / RESTART engine controls.
- Server output is captured live even before the window opens.

## Requirements

- Windows, Node.js, and npm.
- The parent project (`C:\Users\harsh\Projects\agency-os`) with Next.js
  installed in its own `node_modules` (the launcher reuses the parent's
  `node_modules\.bin\next.cmd`, it never installs its own copy).

## Install electron locally

```powershell
cd C:\Users\harsh\Projects\agency-os\launcher
npm install --save-dev electron
```

## Run

```powershell
cd C:\Users\harsh\Projects\agency-os\launcher
npm start
# or directly:
npx electron .
```

Note: a global `electron` binary was **not** found on this machine at the time
the launcher was written (checked `where electron` and
`C:\Users\harsh\AppData\Roaming\npm\node_modules\electron`). Install it locally
with the command above.

## How the server is spawned

The launcher spawns against the **parent** project directory
(`C:\Users\harsh\Projects\agency-os`):

```
node_modules\.bin\next.cmd start -p 3000
```

(cwd = parent folder, so `.next` build output, config, and env files resolve
correctly). If you need a different port, edit `HEALTH_URL`, the `-p` argument,
and the `PORT` env var in `launcher\main.js`.

- Stopping uses `taskkill /pid <pid> /T /F` on Windows so the whole process
  tree is torn down.
- The child process is killed automatically when the launcher exits.

## Files

| File              | Purpose                                            |
|-------------------|----------------------------------------------------|
| `main.js`         | Electron main process, server supervisor, IPC      |
| `preload.js`      | contextBridge API exposed to the renderer          |
| `renderer/`       | Launcher UI (vanilla HTML/CSS/JS)                  |
| `package.json`    | Launcher manifest (`npm start` = `electron .`)     |