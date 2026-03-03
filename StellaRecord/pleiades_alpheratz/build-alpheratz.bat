@echo off
setlocal
echo ========================================================
echo [Alpheratz Release Build Script]
echo ========================================================

echo 1. Stopping existing processes...
taskkill /IM node.exe /F 2>nul
taskkill /IM npm.exe /F 2>nul
taskkill /IM alpheratz.exe /F 2>nul
taskkill /IM vite.exe /F 2>nul

echo 2. Running build...
cd /d "%~dp0"
npm run build && npx tauri build

echo ========================================================
echo Build complete.
echo ========================================================
pause
