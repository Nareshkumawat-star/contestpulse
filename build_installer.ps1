# 🛠️ ContestPulse Build & Package Script
# This script cleans the project and builds a professional NSIS installer and Portable app.

Write-Host "Starting Production Build..." -ForegroundColor Cyan

# 1. Stop any running instances of the app
Write-Host "Stopping running app instances..."
Stop-Process -Name "ContestPulse" -ErrorAction SilentlyContinue
Stop-Process -Name "electron" -ErrorAction SilentlyContinue

# 2. Clean up previous builds
Write-Host "Cleaning dist folder..."
if (Test-Path "dist") { 
    Get-ChildItem "dist" -Exclude "*.exe" | Remove-Item -Recurse -Force
}

# 3. Build the NSIS Installer & Portable App
Write-Host "Building professional installer and portable apps..."
npm run dist

# 4. Report final locations
Write-Host "`n✅ Build Complete!" -ForegroundColor Green
$setup = Get-ChildItem "dist\ContestPulse_Setup*.exe" | Select-Object -First 1
$portable = Get-ChildItem "dist\ContestPulse_Portable*.exe" | Select-Object -First 1

if ($setup) {
    Write-Host "Installer: $($setup.FullName)" -ForegroundColor Yellow
}
if ($portable) {
    Write-Host "Portable : $($portable.FullName)" -ForegroundColor Yellow
}

Write-Host "`nShare the Setup file for a simple one-click installation!" -ForegroundColor Cyan
