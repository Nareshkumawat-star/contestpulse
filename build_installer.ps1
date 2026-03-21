$ErrorActionPreference = "SilentlyContinue"
Stop-Process -Name "electron" -Force
Stop-Process -Name "ContestPulse" -Force
Remove-Item -Path "dist" -Recurse -Force
$cachePath = Join-Path $env:LOCALAPPDATA "electron-builder"
Remove-Item -Path $cachePath -Recurse -Force
Start-Sleep -Seconds 5
npm run dist
