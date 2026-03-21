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
        alwaysOnTop: false, // Changed from true to false
        type: 'desktop', // Tries to pin it to desktop layer on some OS models
        skipTaskbar: true,
        hasShadow: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile('index.html');

    // Position in bottom-right corner on startup
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setPosition(width - 250, height - 250);

    mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
    // Use icon.png for the tray icon
    const iconPath = path.join(__dirname, 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
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
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workArea;
        const bounds = mainWindow.getBounds();

        // Calculate potential new bounds (expanding relative to bottom-right)
        let newX = bounds.x + (bounds.width - w);
        let newY = bounds.y + (bounds.height - h);

        // SMART CLAMPING: If the new position would go off-screen, push it back in
        if (newX < workArea.x) newX = workArea.x;
        if (newY < workArea.y) newY = workArea.y;
        if (newX + w > workArea.x + workArea.width) newX = workArea.x + workArea.width - w;
        if (newY + h > workArea.y + workArea.height) newY = workArea.y + workArea.height - h;

        mainWindow.setBounds({ 
            x: Math.round(newX), 
            y: Math.round(newY), 
            width: Math.round(w), 
            height: Math.round(h) 
        });
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

ipcMain.on('set-autostart', (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe')
    });
});

ipcMain.on('set-skip-taskbar', (event, skip) => {
    if (mainWindow) {
        mainWindow.setSkipTaskbar(skip);
    }
});
