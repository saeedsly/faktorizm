@echo off
setlocal
title Faktorizm - setup
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 goto :nonode

node "%~dp0tools\launch.mjs" setup
echo.
pause
exit /b 0

:nonode
echo.
echo  [ERROR] Node.js is not installed.
echo  Install the LTS version from https://nodejs.org and run this file again.
echo  Node.js 20 or newer is required.
echo.
pause
exit /b 1
