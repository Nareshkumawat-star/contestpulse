const { app, BrowserWindow, ipcMain, shell, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 200,
        height: 200,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        type: 'toolbar', // Helps with stay-on-top and taskbar behavior
        skipTaskbar: false,
        hasShadow: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile('index.html');
    mainWindow.setAlwaysOnTop(true, 'screen-saver');

    // Position in bottom-right corner on startup
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setPosition(width - 250, height - 250);

    mainWindow.on('closed', () => { mainWindow = null; });
    
    // Ensure it stays on top even if focus is lost
    mainWindow.on('blur', () => {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
    });
}

function createTray() {
    // Use a simple blank icon since we can't rely on file icons
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Widget',
            click: () => { if (mainWindow) mainWindow.show(); }
        },
        {
            label: 'Hide Widget',
            click: () => { if (mainWindow) mainWindow.hide(); }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => { app.quit(); }
        }
    ]);

    tray.setToolTip('Contest Widget');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
            }
        }
    });
}

app.whenReady().then(() => {
    // Enable auto-start at login
    app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath('exe')
    });

    createWindow();
    try { createTray(); } catch (e) { /* tray optional */ }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC: open URL in default browser
ipcMain.on('open-url', (event, url) => {
    shell.openExternal(url);
});

// IPC: move window (JS fallback)
ipcMain.on('window-move', (event, x, y) => {
    if (mainWindow) {
        mainWindow.setPosition(Math.round(x), Math.round(y));
    }
});

ipcMain.on('set-window-size', (event, w, h) => {
    if (mainWindow) {
        const bounds = mainWindow.getBounds();
        const newX = bounds.x + (bounds.width - w);
        const newY = bounds.y + (bounds.height - h);
        mainWindow.setBounds({ x: newX, y: newY, width: w, height: h });
    }
});

// IPC: show native notification
ipcMain.on('show-notification', (event, { title, body }) => {
    if (Notification.isSupported()) {
        new Notification({ title, body, silent: false }).show();
    }
});

// IPC: minimize / close
ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.hide();
});
