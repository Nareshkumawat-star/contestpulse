# ContestPulse Self-Contained Installer
# This script copies the app to %LOCALAPPDATA% and registers it in Windows.

$AppName = "ContestPulse"
$DisplayVersion = "1.0.0"
$Publisher = "ContestPulse Team"
$InstallDir = Join-Path $env:LOCALAPPDATA "ContestPulse"
$currentDir = (Get-Location).Path

Write-Host "Installing $AppName..."

# 1. Identity source (if run from SFX, current folder is the app folder)
$ExeSource = Join-Path $currentDir "ContestPulse.exe"
if (!(Test-Path $ExeSource)) {
    # If not in root, try looking in a subfolder (case for some packagers)
    $search = Get-ChildItem -Filter "ContestPulse.exe" -Recurse | Select-Object -First 1
    if ($search) { $currentDir = $search.Directory.FullName; $ExeSource = $search.FullName }
    else { Write-Error "Source ContestPulse.exe not found!"; exit }
}

# 2. Clean up old installation
if (Test-Path $InstallDir) {
    Write-Host "Cleaning up old version..."
    Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 3. Copy files to permanent location
New-Item -ItemType Directory -Path $InstallDir -Force
Copy-Item "$currentDir\*" $InstallDir -Recurse -Force

# 4. Register in Windows Registry (Installed Apps)
$ExePathInLocal = Join-Path $InstallDir "ContestPulse.exe"
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ContestPulse"
if (!(Test-Path $RegPath)) { New-Item $RegPath -Force }

Set-ItemProperty $RegPath -Name "DisplayName" -Value $AppName
Set-ItemProperty $RegPath -Name "DisplayVersion" -Value $DisplayVersion
Set-ItemProperty $RegPath -Name "Publisher" -Value $Publisher
Set-ItemProperty $RegPath -Name "DisplayIcon" -Value "$ExePathInLocal,0"
Set-ItemProperty $RegPath -Name "InstallLocation" -Value $InstallDir

# Use full powershell path and bypass policy for the uninstaller
$UninstCmd = "powershell.exe -ExecutionPolicy Bypass -File `"$InstallDir\uninstall.ps1`""
Set-ItemProperty $RegPath -Name "UninstallString" -Value $UninstCmd
Set-ItemProperty $RegPath -Name "QuietUninstallString" -Value $UninstCmd

Set-ItemProperty $RegPath -Name "EstimatedSize" -Value (Get-ChildItem $InstallDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1024
Set-ItemProperty $RegPath -Name "NoModify" -Value 1
Set-ItemProperty $RegPath -Name "NoRepair" -Value 1

# 5. Create Shortcuts
$Shell = New-Object -ComObject WScript.Shell

# Desktop
$DesktopPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
$Shortcut = $Shell.CreateShortcut($DesktopPath)
$Shortcut.TargetPath = $ExePathInLocal
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Save()

# Start Menu
$ProgramsPath = [Environment]::GetFolderPath("Programs")
$StartMenuPath = Join-Path $ProgramsPath "$AppName.lnk"
$Shortcut = $Shell.CreateShortcut($StartMenuPath)
$Shortcut.TargetPath = $ExePathInLocal
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Save()

# 6. Launch App for the first time
Write-Host "Success! Launching $AppName..."
Start-Process -FilePath $ExePathInLocal -WorkingDirectory $InstallDir

# Done
