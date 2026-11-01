@echo off
setlocal
title Faktorizm - stop
cd /d "%~dp0"

echo Stopping Faktorizm ...
taskkill /f /im node.exe >nul 2>nul
taskkill /f /im python.exe >nul 2>nul
echo Done.
timeout /t 2 /nobreak >nul
