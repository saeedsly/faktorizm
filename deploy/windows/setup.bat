@echo off
setlocal enableextensions
title Faktorizm - setup
cd /d "%~dp0"

echo ============================================================
echo   Faktorizm - first-time setup
echo   Keep this window open until it says DONE.
echo ============================================================
echo.

rem ------------------------------------------------------------------ 1) Node
echo [1/4] Checking Node.js ...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js is not installed.
  echo  Install the LTS version from https://nodejs.org then run setup.bat again.
  echo  On Windows 7 use the Apache-only package instead.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo     Node version: %%v
echo.

rem --------------------------------------------------------- 2) server packages
echo [2/4] Checking server packages ...
if not exist "server\package.json" (
  echo  [ERROR] server\package.json is missing. Extract the whole zip again.
  pause
  exit /b 1
)
if exist "server\node_modules\express" (
  echo     Already included in this package. Nothing to download.
  goto :web
)
pushd server
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  popd
  echo.
  echo  [ERROR] npm install failed. Check the internet connection and retry.
  echo.
  pause
  exit /b 1
)
popd
echo.

:web
if exist "web\index.html" goto :python
echo  [ERROR] User interface files are missing (web\index.html). Extract the whole zip again.
pause
exit /b 1

rem ------------------------------------------------------------- 3) Python + OCR
:python
echo [3/4] Local OCR engine (Python + PP-OCR) ...
if not exist "ocr-service\service.py" (
  echo     This package has no ocr-service folder; the app will use the browser engine.
  goto :done
)

set "PYTHON_CMD="
py -3.11 -c "import sys" >nul 2>nul && set "PYTHON_CMD=py -3.11"
if not defined PYTHON_CMD py -3.12 -c "import sys" >nul 2>nul && set "PYTHON_CMD=py -3.12"
if not defined PYTHON_CMD py -3.10 -c "import sys" >nul 2>nul && set "PYTHON_CMD=py -3.10"
if not defined PYTHON_CMD py -3 -c "import sys" >nul 2>nul && set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD python -c "import sys" >nul 2>nul && set "PYTHON_CMD=python"
if not defined PYTHON_CMD (
  echo     [WARN] Python is not installed.
  echo            The app still works, but reading uses the slower browser engine.
  echo            For the strong engine install Python 3.11 from python.org
  echo            (tick Add python.exe to PATH) and run setup.bat again.
  goto :done
)

%PYTHON_CMD% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
  echo     [WARN] Python 3.10 or newer is required for the strong engine.
  goto :done
)

if exist "ocr-service\.venv\Scripts\python.exe" goto :deps
echo     Creating the private environment (ocr-service\.venv) ...
%PYTHON_CMD% -m venv "ocr-service\.venv"
if errorlevel 1 (
  echo     [WARN] Could not create the environment. Run setup.bat as administrator.
  goto :done
)

:deps
echo     Installing OCR packages (first run downloads about 60 MB) ...
pushd ocr-service
if exist "wheels" (
  ".venv\Scripts\python.exe" -m pip install --no-index --find-links wheels -r requirements.txt
) else (
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul 2>nul
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)
if errorlevel 1 (
  popd
  echo.
  echo     [WARN] Installing the OCR packages failed (internet or firewall).
  echo            The app still works with the browser engine.
  echo            Retry later with setup.bat, or copy the wheel files into
  echo            ocr-service\wheels and run setup.bat again.
  goto :done
)
popd

echo.
echo     Engine check:
pushd ocr-service
".venv\Scripts\python.exe" check_engines.py
popd

:done
echo.
echo ============================================================
echo   Setup finished.
echo   Next: run start.bat
echo   App URL: http://localhost:8787
echo   Login  : admin@faktorizm.ir / Admin@1405
echo ============================================================
echo.
pause
