# ContestPulse Installer Bundle Script (IExpress SFX)
Write-Host "Building Single-File Installer..."

$sourceDir = "dist\ContestPulse-win32-x64"
$installerExe = "dist\ContestPulse_Setup.exe"
$sedFile = "dist\setup.sed"

if (!(Test-Path $sourceDir)) { 
    Write-Error "Build folder not found!"; exit 
}

# 1. Ensure installer scripts are in the source folder
Copy-Item "install.ps1", "uninstall.ps1", "icon.png" -Destination $sourceDir -Force

# 2. Create a batch file that skips security prompts and runs PowerShell
$batch = @(
    "@echo off",
    "powershell -ExecutionPolicy Bypass -File install.ps1",
    "exit"
)
$batch | Out-File -FilePath "$sourceDir\start_install.bat" -Encoding ascii

# 3. Generate IExpress (.sed) file
# Note: IExpress can only bundle files in one flat list. 
# We'll use a trick or just bundle the root for now.
# Actually, IExpress is limited to ~100 files in a flat list. 
# Electron has many files. We'll use a zip-based SFX instead.

# --- ZIP-based SFX Strategy ---
Write-Host "Creating zip-based SFX..."
$zipFile = "dist\files.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile }
Compress-Archive -Path "$sourceDir\*" -DestinationPath $zipFile

# We'll use a simple IExpress wrapper that extracts THIS zip and runs it.
# Extract tool: we can use powershell's Expand-Archive.

$currentPath = (Get-Location).Path
$sedLines = @(
    "[Version]",
    "Class=IEXPRESS",
    "SEDVersion=3",
    "[Options]",
    "PackagePurpose=InstallFreeLib",
    "ShowInstallProgramWindow=0",
    "HideExtractAnimation=0",
    "UseLongFileName=1",
    "InsideCompressed=1",
    "CAB_FixedSize=0",
    "CAB_ResvCodeSigning=0",
    "RebootMode=N",
    "InstallPrompt=%InstallPrompt%",
    "DisplayLicense=%DisplayLicense%",
    "FinishMessage=%FinishMessage%",
    "TargetName=%TargetName%",
    "FriendlyName=%FriendlyName%",
    "AppLaunched=%AppLaunched%",
    "PostInstallCmd=%PostInstallCmd%",
    "SourceFiles=SourceFiles",
    "[Strings]",
    "InstallPrompt=",
    "DisplayLicense=",
    "FinishMessage=ContestPulse is ready!",
    "TargetName=$currentPath\$installerExe",
    "FriendlyName=ContestPulse Installer",
    "AppLaunched=cmd /c start_install.bat",
    "PostInstallCmd=<None>",
    "[SourceFiles]",
    "SourceFiles1=$currentPath\dist\",
    "[SourceFiles1]",
    "FILE0=`"files.zip`"",
    "FILE1=`"start_install.bat`""
)
$sedLines | Out-File -FilePath $sedFile -Encoding ascii

# Update start_install.bat to handle the zip
$batch = @(
    "@echo off",
    "set `"T=%TEMP%\CP_Install`"",
    "if exist `"%T%`" rd /s /q `"%T%`"",
    "mkdir `"%T%`"",
    "powershell -Command `"Expand-Archive -Path files.zip -DestinationPath '%T%' -Force`"",
    "cd /d `"%T%`"",
    "powershell -ExecutionPolicy Bypass -File install.ps1",
    "exit"
)
$batch | Out-File -FilePath "dist\start_install.bat" -Encoding ascii

Write-Host "Compiling into EXE..."
cmd /c "iexpress /n /q $sedFile"

if (Test-Path $installerExe) {
    Write-Host "✅ Success! Single-file installer: $installerExe"
} else {
    Write-Error "❌ IExpress failed to create the EXE."
}
