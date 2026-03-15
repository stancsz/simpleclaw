const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;
let agentProcess = null;

const isDev = process.env.NODE_ENV === 'development';
const isProd = !isDev;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    show: false,
    backgroundColor: '#0f172a'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(isDev ? 'http://localhost:3000' : 'http://localhost:3001');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '../server');
    if (!fs.existsSync(path.join(serverPath, 'package.json'))) {
      reject(new Error('Server directory not found'));
      return;
    }

    if (isDev) {
      console.log('Development mode: Assuming Next.js dev server is running on localhost:3000');
      resolve(null);
      return;
    }

    // In production, ensure the server is built
    const nextBuildDir = path.join(serverPath, '.next');
    if (!fs.existsSync(nextBuildDir)) {
      console.warn('Next.js build directory not found. Attempting to build...');
      try {
        const buildProcess = spawn('npm', ['run', 'build'], {
          cwd: serverPath,
          stdio: 'pipe',
          shell: true
        });
        
        buildProcess.stdout.on('data', (data) => {
          console.log(`Build: ${data}`);
        });
        
        buildProcess.stderr.on('data', (data) => {
          console.error(`Build error: ${data}`);
        });
        
        buildProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Build failed with code ${code}`));
            return;
          }
          console.log('Server built successfully');
          startProductionServer(serverPath, resolve, reject);
        });
      } catch (error) {
        reject(new Error(`Failed to build server: ${error.message}`));
      }
    } else {
      startProductionServer(serverPath, resolve, reject);
    }
  });
}

function startProductionServer(serverPath, resolve, reject) {
  serverProcess = spawn('npm', ['start'], {
    cwd: serverPath,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: '3001' }
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
    if (data.toString().includes('ready') || data.toString().includes('localhost')) {
      resolve(serverProcess);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    reject(err);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    serverProcess = null;
  });
}

function startAgent() {
  return new Promise((resolve, reject) => {
    const agentPath = path.join(__dirname, '..');
    if (!fs.existsSync(path.join(agentPath, 'package.json'))) {
      reject(new Error('Agent directory not found'));
      return;
    }

    agentProcess = spawn('bun', ['run', 'start'], {
      cwd: agentPath,
      stdio: 'pipe',
      shell: true
    });

    agentProcess.stdout.on('data', (data) => {
      console.log(`Agent: ${data}`);
      if (data.toString().includes('SimpleClaw CLI') || data.toString().includes('ready')) {
        resolve(agentProcess);
      }
    });

    agentProcess.stderr.on('data', (data) => {
      console.error(`Agent error: ${data}`);
    });

    agentProcess.on('error', (err) => {
      console.error('Failed to start agent:', err);
      reject(err);
    });

    agentProcess.on('close', (code) => {
      console.log(`Agent process exited with code ${code}`);
      agentProcess = null;
    });
  });
}

async function initializeApp() {
  try {
    console.log('Starting SimpleClaw Desktop...');
    
    // Start server first
    await startServer();
    console.log('Server started successfully');
    
    // Create window after server is ready
    createWindow();
    console.log('Window created successfully');
    
    // Start agent in background (non-blocking)
    startAgent().then(() => {
      console.log('Agent started successfully');
    }).catch((error) => {
      console.error('Failed to start agent:', error);
      // Don't quit the app if agent fails - user can restart it via UI
    });
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
}

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  console.log('Shutting down processes...');
  
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  
  if (agentProcess) {
    agentProcess.kill('SIGTERM');
    agentProcess = null;
  }
});

ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    isDev,
    isProd
  };
});

ipcMain.handle('restart-agent', async () => {
  if (agentProcess) {
    agentProcess.kill('SIGTERM');
    agentProcess = null;
  }
  
  try {
    await startAgent();
    return { success: true, message: 'Agent restarted successfully' };
  } catch (error) {
    return { success: false, message: `Failed to restart agent: ${error.message}` };
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return { success: true };
});