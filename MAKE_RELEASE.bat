@echo off
setlocal
cd /d "%~dp0"
title TETORISU Release Maker

where node.exe >nul 2>&1
if errorlevel 1 goto node_missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto node_missing

if not exist "node_modules\.bin\vite.cmd" (
  echo Preparing build tools...
  call npm.cmd install
  if errorlevel 1 goto failed
)

echo Building TETORISU...
call npm.cmd run build
if errorlevel 1 goto failed

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0PACKAGE.ps1"
if errorlevel 1 goto failed

echo.
echo The distribution ZIP is ready in the release folder.
pause
exit /b 0

:node_missing
echo Node.js is required only for making a new distribution package.
echo Install the LTS version and run MAKE_RELEASE.bat again.
pause
exit /b 1

:failed
echo.
echo The distribution package could not be made.
pause
exit /b 1
