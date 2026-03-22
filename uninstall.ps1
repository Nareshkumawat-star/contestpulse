# 🛠️ ContestPulse Uninstaller
$AppName = "ContestPulse"
$InstallDir = Join-Path $env:LOCALAPPDATA "ContestPulse"

Write-Host "Uninstalling $AppName..." -ForegroundColor Yellow

# 1. Remove Files
if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
}

# 2. Remove Registry
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ContestPulse"
if (Test-Path $RegPath) {
    Remove-Item $RegPath -Force
}

# 3. Remove Shortcuts
$DesktopShortcut = [Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"]
if (Test-Path $DesktopShortcut) { Remove-Item $DesktopShortcut }

$StartMenuShortcut = [Join-Path ([Environment]::GetFolderPath("Programs")) "$AppName.lnk"]
if (Test-Path $StartMenuShortcut) { Remove-Item $StartMenuShortcut }

Write-Host "`n✅ Successfully uninstalled $AppName." -ForegroundColor Green
