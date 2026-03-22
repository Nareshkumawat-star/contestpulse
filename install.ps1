# ContestPulse Custom Installer
# This script "installs" the app so it shows in Windows "Installed Apps".

$AppName = "ContestPulse"
$DisplayVersion = "1.0.0"
$Publisher = "ContestPulse Team"
$InstallDir = Join-Path $env:LOCALAPPDATA "ContestPulse"
$SourceDir = "dist\ContestPulse-win32-x64"
$ExePath = Join-Path $InstallDir "ContestPulse.exe"
$currentDir = (Get-Location).Path

Write-Host "Installing $AppName..."

# 1. Create directory and copy files
if (!(Test-Path $SourceDir)) {
    Write-Error "Error: Build folder not found at $SourceDir. Please run npx electron-packager first."
    exit
}

if (Test-Path $InstallDir) {
    Write-Host "Cleaning up old installation..."
    Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $InstallDir -Force
Copy-Item "$SourceDir\*" $InstallDir -Recurse -Force

# 2. Register in Windows (Installed Apps)
Write-Host "Registering in Windows..."
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ContestPulse"
if (!(Test-Path $RegPath)) { New-Item $RegPath -Force }

Set-ItemProperty $RegPath -Name "DisplayName" -Value $AppName
Set-ItemProperty $RegPath -Name "DisplayVersion" -Value $DisplayVersion
Set-ItemProperty $RegPath -Name "Publisher" -Value $Publisher
Set-ItemProperty $RegPath -Name "DisplayIcon" -Value "$ExePath,0"
Set-ItemProperty $RegPath -Name "InstallLocation" -Value $InstallDir
Set-ItemProperty $RegPath -Name "UninstallString" -Value "powershell.exe -ExecutionPolicy Bypass -File `"$currentDir\uninstall.ps1`""
Set-ItemProperty $RegPath -Name "EstimatedSize" -Value (Get-ChildItem $InstallDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1024
Set-ItemProperty $RegPath -Name "NoModify" -Value 1
Set-ItemProperty $RegPath -Name "NoRepair" -Value 1

# 3. Create Shortcuts
Write-Host "Creating Shortcuts..."
$Shell = New-Object -ComObject WScript.Shell

# Desktop
$DesktopPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
$Shortcut = $Shell.CreateShortcut($DesktopPath)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Save()

# Start Menu
$ProgramsPath = [Environment]::GetFolderPath("Programs")
$StartMenuPath = Join-Path $ProgramsPath "$AppName.lnk"
$Shortcut = $Shell.CreateShortcut($StartMenuPath)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Save()

Write-Host "Successfully installed! $AppName is now in your Start Menu and 'Installed Apps'."
