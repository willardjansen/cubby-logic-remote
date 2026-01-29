const { app, BrowserWindow, dialog, Menu, Tray, shell, ipcMain } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let midiServerProcess = null;
let splashWindow = null;

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Create splash screen window
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 500,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
  return splashWindow;
}

function updateSplashStatus(status) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status', status);
  }
}

function sendConnectionInfo(url) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('connection-info', { url });
  }
}

// Default ports - will be updated dynamically if busy
const DEFAULT_WS_PORT = 7101;
const DEFAULT_NEXT_PORT = 7100;

// Ports to avoid on macOS (used by system services like AirPlay)
const MACOS_RESERVED_PORTS = [3000, 5000, 7000];

// Actual ports in use (set after finding available ports)
let WS_PORT = DEFAULT_WS_PORT;
let NEXT_PORT = DEFAULT_NEXT_PORT;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

// Find a pair of consecutive available ports
async function findAvailablePortPair(startPort = 7100) {
  let port = startPort;
  for (let i = 0; i < 20; i++) {
    while (MACOS_RESERVED_PORTS.includes(port) || MACOS_RESERVED_PORTS.includes(port + 1)) {
      port++;
    }
    const httpAvailable = await isPortAvailable(port);
    const wsAvailable = await isPortAvailable(port + 1);
    if (httpAvailable && wsAvailable) {
      return { httpPort: port, wsPort: port + 1 };
    }
    port++;
  }
  throw new Error('Could not find available port pair');
}

// Find Node.js executable
function findNodeExecutable() {
  if (process.execPath && process.execPath.includes('node')) {
    return process.execPath;
  }

  const possiblePaths = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    path.join(process.env.HOME || '', '.nvm/versions/node/v20.0.0/bin/node'),
    path.join(process.env.HOME || '', '.nvm/versions/node/v18.0.0/bin/node'),
    '/usr/bin/node',
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
  ];

  for (const nodePath of possiblePaths) {
    if (nodePath && fs.existsSync(nodePath)) {
      console.log('Found Node.js at:', nodePath);
      return nodePath;
    }
  }

  console.log('Using "node" from PATH');
  return 'node';
}

// Start MIDI server as a separate Node.js process
function startMidiServer() {
  const logPath = path.join(app.getPath('userData'), 'midi-server.log');
  const log = (msg) => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    try {
      fs.appendFileSync(logPath, logMsg);
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  };

  log('\n=== Starting MIDI Bridge Server for Logic Pro ===\n');

  const midiServerPath = isDev
    ? path.join(__dirname, '..', 'midi-server.js')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'midi-server.js');

  log(`MIDI server path: ${midiServerPath}`);
  log(`File exists: ${fs.existsSync(midiServerPath)}`);

  if (!fs.existsSync(midiServerPath)) {
    log(`ERROR: MIDI server not found at: ${midiServerPath}`);
    return;
  }

  const serverCwd = isDev
    ? path.join(__dirname, '..')
    : path.join(process.resourcesPath, 'app.asar.unpacked');

  const nodeExecutable = findNodeExecutable();
  log(`Using Node.js executable: ${nodeExecutable}`);
  log(`Node.js exists: ${fs.existsSync(nodeExecutable)}`);
  log(`Starting MIDI server with cwd: ${serverCwd}`);

  try {
    midiServerProcess = spawn(nodeExecutable, [midiServerPath, WS_PORT.toString()], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: serverCwd
    });

    log(`MIDI server process spawned, PID: ${midiServerProcess.pid}`);

    midiServerProcess.stdout.on('data', (data) => {
      log(`[MIDI Server] ${data.toString().trim()}`);
    });

    midiServerProcess.stderr.on('data', (data) => {
      log(`[MIDI Server Error] ${data.toString().trim()}`);
    });

    midiServerProcess.on('error', (err) => {
      log(`ERROR: Failed to start MIDI server: ${err.message}`);
    });

    midiServerProcess.on('exit', (code, signal) => {
      log(`MIDI server exited with code ${code}, signal ${signal}`);
    });
  } catch (err) {
    log(`EXCEPTION while spawning: ${err.message}`);
  }
}

function stopMidiServer() {
  if (midiServerProcess) {
    console.log('Stopping MIDI server...');
    midiServerProcess.kill();
    midiServerProcess = null;
  }
}

// Simple static file server for production
const http = require('http');
let httpServer = null;

function startHttpServer() {
  return new Promise((resolve) => {
    if (isDev) {
      console.log(`Development mode - connect to Next.js dev server at http://localhost:${NEXT_PORT}`);
      resolve();
      return;
    }

    const staticDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'out');
    const staticDirAlt = path.join(__dirname, '..', 'out');

    let outDir = staticDir;
    if (!fs.existsSync(outDir)) {
      outDir = staticDirAlt;
    }

    if (!fs.existsSync(outDir)) {
      console.log('Static files not found, skipping HTTP server');
      resolve();
      return;
    }

    console.log('Starting static file server from:', outDir);

    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    httpServer = http.createServer((req, res) => {
      let filePath = req.url === '/' ? '/index.html' : req.url;
      filePath = filePath.split('?')[0];

      // Config API endpoint
      if (filePath === '/api/config') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ wsPort: WS_PORT, httpPort: NEXT_PORT }));
        return;
      }

      const fullPath = path.join(outDir, filePath);
      const ext = path.extname(fullPath);

      if (!fullPath.startsWith(outDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          const indexPath = path.join(fullPath, 'index.html');
          fs.readFile(indexPath, (err2, data2) => {
            if (err2) {
              fs.readFile(fullPath + '.html', (err3, data3) => {
                if (err3) {
                  fs.readFile(path.join(outDir, 'index.html'), (err4, data4) => {
                    if (err4) {
                      res.writeHead(404);
                      res.end('Not Found');
                    } else {
                      res.writeHead(200, { 'Content-Type': 'text/html' });
                      res.end(data4);
                    }
                  });
                } else {
                  res.writeHead(200, { 'Content-Type': 'text/html' });
                  res.end(data3);
                }
              });
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(data2);
            }
          });
        } else {
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
          res.end(data);
        }
      });
    });

    httpServer.listen(NEXT_PORT, '0.0.0.0', () => {
      console.log(`Static server running on http://localhost:${NEXT_PORT}`);
      resolve();
    });

    httpServer.on('error', (err) => {
      console.error('Failed to start static server:', err);
      resolve();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = isDev
    ? path.join(__dirname, '..', 'public', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png');

  if (!fs.existsSync(iconPath)) {
    console.log('Tray icon not found at:', iconPath);
    return;
  }

  tray = new Tray(iconPath);
  tray.setToolTip('Cubby Remote for Logic Pro');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Cubby Logic',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: `Ports: HTTP ${NEXT_PORT}, WS ${WS_PORT}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'View MIDI Server Log',
      click: () => {
        const logPath = path.join(app.getPath('userData'), 'midi-server.log');
        if (fs.existsSync(logPath)) {
          shell.openPath(logPath);
        } else {
          dialog.showMessageBox({
            type: 'info',
            title: 'Log File',
            message: `Log file not found at:\n${logPath}`,
            buttons: ['OK']
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopMidiServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// App ready
app.whenReady().then(async () => {
  // Show splash screen first
  createSplashWindow();
  updateSplashStatus('Starting Cubby Logic Remote...');

  try {
    updateSplashStatus('Finding available ports...');
    const ports = await findAvailablePortPair(DEFAULT_NEXT_PORT);
    NEXT_PORT = ports.httpPort;
    WS_PORT = ports.wsPort;

    if (NEXT_PORT !== DEFAULT_NEXT_PORT) {
      console.log(`Default ports were busy, using ${NEXT_PORT} (HTTP) and ${WS_PORT} (WebSocket)`);
    }

    updateSplashStatus('Starting MIDI server...');
    startMidiServer();

    updateSplashStatus('Starting web server...');
    await startHttpServer();

    createTray();

    // Show connection info and wait for user to click continue
    const localIP = getLocalIP();
    const connectionUrl = `http://${localIP}:${NEXT_PORT}`;
    updateSplashStatus('Ready!');
    sendConnectionInfo(connectionUrl);

    // Wait for user to click "Open in Browser"
    ipcMain.once('splash-continue', () => {
      createWindow();
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
          splashWindow = null;
        }
      }, 500);
    });

    console.log(`\nApp running. HTTP: ${NEXT_PORT}, WebSocket: ${WS_PORT}`);
  } catch (err) {
    console.error('Failed to start app:', err);
    if (splashWindow) splashWindow.close();
    dialog.showErrorBox('Startup Error', `Failed to start: ${err.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopMidiServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopMidiServer();
  if (httpServer) {
    httpServer.close();
  }
});
