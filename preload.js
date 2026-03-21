const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setWindowSize: (w, h) => ipcRenderer.send('set-window-size', w, h),
    openURL: (url) => ipcRenderer.send('open-url', url),
    showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    moveWindow: (x, y) => ipcRenderer.send('window-move', x, y),
    setAutostart: (enable) => ipcRenderer.send('set-autostart', enable),
    setSkipTaskbar: (skip) => ipcRenderer.send('set-skip-taskbar', skip)
});
