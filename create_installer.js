const electronInstaller = require('electron-winstaller');
const path = require('path');

async function createInstaller() {
  try {
    console.log('Building installer with electron-winstaller...');
    await electronInstaller.createWindowsInstaller({
      appDirectory: path.join(__dirname, 'dist', 'ContestPulse-win32-x64'),
      outputDirectory: path.join(__dirname, 'dist', 'installers'),
      authors: 'ContestPulse Team',
      exe: 'ContestPulse.exe',
      description: 'ContestPulse Widget',
      setupExe: 'ContestPulseSetup.exe',
      noMsi: true,
    });
    console.log('It worked! Installer created.');
  } catch (e) {
    console.log(`No dice: ${e.message}`);
  }
}

createInstaller();
