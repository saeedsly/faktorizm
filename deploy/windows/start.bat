@echo off
setlocal enableextensions
title Faktorizm - server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org
  pause
  exit /b 1
)

if exist "web\index.html" goto :env
echo [ERROR] User interface files are missing (web\index.html). Extract the whole zip again.
pause
exit /b 1

:env
if exist ".env" goto :ocr
echo [ERROR] .env is missing. Extract the whole zip again.
pause
exit /b 1

:ocr
rem ---- local OCR engine (optional, strong) ----
if not exist "ocr-service\.venv\Scripts\python.exe" goto :noocr
if not exist "ocr-service\service.py" goto :noocr
echo Starting the local OCR engine ...
start "Faktorizm OCR engine" /min cmd /c ""%~dp0ocr-service\.venv\Scripts\python.exe" "%~dp0ocr-service\service.py""

set "OCR_READY="
for /l %%i in (1,1,30) do (
  if not defined OCR_READY (
    timeout /t 2 /nobreak >nul
    for /f %%s in ('powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:8789/health).StatusCode}catch{0}"') do (
      if "%%s"=="200" set "OCR_READY=1"
    )
  )
)
if defined OCR_READY (
  echo   [ok] OCR engine is ready on port 8789
) else (
  echo   [!!] OCR engine did not answer. The app will use the browser engine.
  echo        Run check-engines.bat to see the reason.
)
goto :boot

:noocr
echo   [!!] Strong OCR engine is not installed (no Python environment).
echo        Reading will use the browser engine.
echo        Run setup.bat once to install it, or falcon-setup.bat for the best engine.

:boot
echo ============================================================
echo   Faktorizm is starting ...
echo.
echo   App URL : http://localhost:8787
echo   Keep this window open while using the app.
echo   To stop : close this window or press Ctrl+C.
echo ============================================================
echo.

start "" /min cmd /c "timeout /t 4 /nobreak >nul & explorer http://localhost:8787"
node --env-file=.env server/src/index.js

echo.
echo Server stopped.
pause
