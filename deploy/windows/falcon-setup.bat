@echo off
setlocal enableextensions
title Faktorizm - Falcon-OCR setup
cd /d "%~dp0"
chcp 65001 >nul

echo ============================================================
echo   Falcon-OCR (TII, 270M) - the most accurate engine
echo.
echo   This downloads about 1.1 GB of model weights and
echo   installs torch (another 2-3 GB). It is done only once.
echo   Without it the app already reads with PP-OCR.
echo ============================================================
echo.

if not exist "ocr-service\.venv\Scripts\python.exe" (
  echo [ERROR] Run setup.bat first (it creates the Python environment).
  echo.
  pause
  exit /b 1
)

set /p ANSWER=Continue? [y/N]
if /i not "%ANSWER%"=="y" (
  echo Cancelled.
  pause
  exit /b 0
)

echo.
echo [1/3] Installing torch and transformers ...
"ocr-service\.venv\Scripts\python.exe" -m pip install --upgrade pip
"ocr-service\.venv\Scripts\python.exe" -m pip install -r "ocr-service\requirements-falcon.txt" huggingface_hub
if errorlevel 1 (
  echo.
  echo [ERROR] Installing torch failed. Check the internet connection and retry.
  pause
  exit /b 1
)

echo.
echo [2/3] Downloading the model weights ...
"ocr-service\.venv\Scripts\python.exe" "ocr-service\download_models.py" --falcon
if errorlevel 1 (
  echo.
  echo [ERROR] Download failed. If huggingface.co is blocked on this network,
  echo         download the model on another computer and copy the folder to:
  echo         ocr-service\models\falcon-ocr-arabic
  pause
  exit /b 1
)

echo.
echo [3/3] Checking everything ...
"ocr-service\.venv\Scripts\python.exe" "ocr-service\check_engines.py"

echo.
echo Done. Start the app with start.bat. Falcon is used automatically
echo when it is ready; otherwise PP-OCR takes over.
pause
