@echo off
setlocal
cd /d "%~dp0"
title TETORISU - James Projection Room

if not exist "dist\index.html" goto missing_build
if not exist "SERVER.ps1" goto missing_server

set "LAN_SWITCH="
if /i "%~1"=="--lan" set "LAN_SWITCH=-Lan"
if /i "%~2"=="--lan" set "LAN_SWITCH=-Lan"

set "JAMES_TEST_SWITCH="
if /i "%~1"=="--james-test" set "JAMES_TEST_SWITCH=-JamesTest"
if /i "%~2"=="--james-test" set "JAMES_TEST_SWITCH=-JamesTest"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0SERVER.ps1" -Root "%~dp0dist" %LAN_SWITCH% %JAMES_TEST_SWITCH%
if errorlevel 1 goto server_failed
exit /b 0

:missing_build
echo The game files are missing.
echo Please use a complete TETORISU distribution folder.
pause
exit /b 1

:missing_server
echo SERVER.ps1 is missing.
echo Please use a complete TETORISU distribution folder.
pause
exit /b 1

:server_failed
echo.
echo TETORISU could not start. Check the message above.
pause
exit /b 1
