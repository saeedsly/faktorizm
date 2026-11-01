@echo off
setlocal enableextensions
title Faktorizm - stop
cd /d "%~dp0"

echo Stopping Faktorizm ...
taskkill /f /im node.exe >nul 2>nul
taskkill /f /im python.exe >nul 2>nul
echo Done. Both the app server and the OCR engine were closed.
timeout /t 2 /nobreak >nul
