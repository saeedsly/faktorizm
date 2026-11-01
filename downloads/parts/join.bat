@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo.
echo  FAKTORIZM - joining package parts
echo.

set OK=0
if exist xampp.part0.bin if exist xampp.part3.bin (
  echo  [1/2] building faktorizm-xampp.zip ...
  copy /b xampp.part0.bin+xampp.part1.bin+xampp.part2.bin+xampp.part3.bin faktorizm-xampp.zip >nul
  if exist faktorizm-xampp.zip echo        OK - faktorizm-xampp.zip & set OK=1
)

if exist htdocs.part0.bin if exist htdocs.part2.bin (
  echo  [2/2] building faktorizm-htdocs.zip ...
  copy /b htdocs.part0.bin+htdocs.part1.bin+htdocs.part2.bin faktorizm-htdocs.zip >nul
  if exist faktorizm-htdocs.zip echo        OK - faktorizm-htdocs.zip & set OK=1
)

if "%OK%"=="0" (
  echo  No part files found in this folder.
  echo  Put the downloaded .bin parts next to this file and run it again.
) else (
  echo.
  echo  Done. Extract the zip file, then run setup.bat and start.bat.
)
echo.
pause
