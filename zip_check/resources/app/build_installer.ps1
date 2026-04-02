# 🛠️ ContestPulse Build & Package Script
# This script cleans the project and builds a professional installer.

Write-Host "Starting Production Build..." -ForegroundColor Cyan

# 1. Stop any running instances of the app
Write-Host "Stopping running app instances..."
Stop-Process -Name "ContestPulse" -ErrorAction SilentlyContinue
Stop-Process -Name "electron" -ErrorAction SilentlyContinue

# 2. Clean up previous builds
Write-Host "Cleaning dist folder..."
if (Test-Path "dist") { Remove-Item -Path "dist" -Recurse -Force }

# 3. Run electron-builder to create the installer
Write-Host "Building professional installer (electron-builder)..."
npm run dist

Write-Host "Build Complete! Check the dist folder for your installer." -ForegroundColor Green
