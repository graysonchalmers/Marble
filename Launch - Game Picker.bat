@echo off
title Marble Game Launcher Picker
setlocal

echo =========================================
echo   Marble Game Launcher Picker
echo   Default: Latest Version on port 5174
echo =========================================
echo.
echo   [1] Launch Latest Version
echo   [2] Launch Box3D Beta
echo.
echo Choose a version. Defaulting to [1] in 10 seconds...
choice /c 12 /n /t 10 /d 1 /m "Version: "
set VERSION_CHOICE=%ERRORLEVEL%

if "%VERSION_CHOICE%"=="2" (
    call "%~dp0Launch - Box3D Beta.bat"
) else (
    call "%~dp0Launch - Latest Version.bat"
)
