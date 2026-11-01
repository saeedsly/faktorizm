@echo off
setlocal enableextensions
title Faktorizm - engine check
cd /d "%~dp0"
chcp 65001 >nul

if not exist "ocr-service\check_engines.py" (
  echo This package has no local OCR service. Reading uses the browser engine.
  pause
  exit /b 1
)

if exist "ocr-service\.venv\Scripts\python.exe" (
  "ocr-service\.venv\Scripts\python.exe" "ocr-service\check_engines.py"
  goto :end
)
where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed, so the strong OCR engine cannot run.
  echo Install Python 3.11 from python.org, then run setup.bat.
  pause
  exit /b 1
)
python "ocr-service\check_engines.py"

:end
echo.
echo Copy the text above if you need help.
pause
