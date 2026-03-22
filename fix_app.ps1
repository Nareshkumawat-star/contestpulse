# 🛠️ ContestPulse App Fixer
# This script kills rogue Electron processes and clears the cache to fix "Access is denied" errors.

Write-Host "Stopping ContestPulse and Electron processes..." -ForegroundColor Cyan
Stop-Process -Name "ContestPulse" -ErrorAction SilentlyContinue
Stop-Process -Name "electron" -ErrorAction SilentlyContinue

Write-Host "Clearing app cache..." -ForegroundColor Yellow
$appDataPath = "$env:APPDATA\contest-widget"
if (Test-Path $appDataPath) {
    Remove-Item -Path $appDataPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Cache cleared successfully!" -ForegroundColor Green
} else {
    Write-Host "AppData folder not found, skipping cache clear."
}

Write-Host "You can now run 'npm start' again!" -ForegroundColor Green
