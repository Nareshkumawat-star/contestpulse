# 🛠️ ContestPulse Single-EXE Package Script
# This script uses IExpress (Windows built-in) to create a single portable EXE.

Write-Host "📦 Creating Single-File Portable EXE..." -ForegroundColor Cyan

$sourceDir = "dist\win-unpacked"
$outputZip = "dist\app.zip"
$sfxExe = "dist\ContestPulse_Portable.exe"
$sedFile = "dist\package.sed"

# 1. Check if source exists
if (!(Test-Path $sourceDir)) {
    Write-Error "Source app not found in $sourceDir."
    exit
}

# 2. Create the ZIP archive
Write-Host "Step 1: Zipping app files..."
if (Test-Path $outputZip) { Remove-Item $outputZip -ErrorAction SilentlyContinue }
Compress-Archive -Path "$sourceDir\*" -DestinationPath $outputZip -Force

# 3. Create the Launcher Script (launch.bat)
Write-Host "Step 2: Creating launcher..."
$batches = @(
    "@echo off",
    "set `"TEMP_DIR=%TEMP%\ContestPulse_Extracted`"",
    "if exist `"%TEMP_DIR%`" rd /s /q `"%TEMP_DIR%`"",
    "mkdir `"%TEMP_DIR%`"",
    "powershell -Command `"Expand-Archive -Path 'app.zip' -DestinationPath '%TEMP_DIR%' -Force`"",
    "start `"`" `"%TEMP_DIR%\ContestPulse.exe`""
)
$batches | Out-File -FilePath "dist\launch.bat" -Encoding ascii

# 4. Create IExpress Directive (.sed) file
Write-Host "Step 3: Generating installer config..."
$currentPath = (Get-Location).Path
$sedLines = @(
    "[Version]",
    "Class=IEXPRESS",
    "SEDVersion=3",
    "[Options]",
    "PackagePurpose=InstallFreeLib",
    "ShowInstallProgramWindow=0",
    "HideExtractAnimation=1",
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
    "FinishMessage=",
    "TargetName=$currentPath\$sfxExe",
    "FriendlyName=ContestPulse Portable",
    "AppLaunched=cmd /c launch.bat",
    "PostInstallCmd=<None>",
    "[SourceFiles]",
    "SourceFiles1=$currentPath\dist\",
    "[SourceFiles1]",
    "FILE0=`"app.zip`"",
    "FILE1=`"launch.bat`""
)
$sedLines | Out-File -FilePath $sedFile -Encoding ascii

# 5. Run IExpress
Write-Host "Step 4: Compiling into EXE (IExpress)..."
# We use cmd to run iexpress to ensure it's in the path and handled correctly
cmd /c "iexpress /n /q $sedFile"

if (Test-Path $sfxExe) {
    Write-Host "✅ Success! Single-file EXE created: $sfxExe" -ForegroundColor Green
} else {
    Write-Error "❌ Failed to create EXE. Check if IExpress is blocked or permissions are missing."
}
