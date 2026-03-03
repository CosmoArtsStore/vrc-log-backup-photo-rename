@echo off
setlocal
echo ========================================================
echo [Alpheratz Clean Build & Dev Launcher]
echo ========================================================

echo 1. Stopping existing processes...
taskkill /IM node.exe /F 2>nul
taskkill /IM npm.exe /F 2>nul
taskkill /IM alpheratz.exe /F 2>nul
taskkill /IM vite.exe /F 2>nul

echo 2. Starting Dev Server (Port 1420)...
cd /d "%~dp0"
npm run tauri dev
pause
