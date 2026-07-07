@echo off
title Marble Game Latest Version
setlocal
set PORT=5174
set URL=http://localhost:%PORT%/

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/ before running.
    goto error_exit
)

if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies.
        goto error_exit
    )
)

echo [INFO] Launching Latest Version at %URL%
echo [INFO] Checking for existing instances on port %PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /c:":%PORT% "') do (
    echo [INFO] Terminating old server instance [PID: %%a]...
    taskkill /f /pid %%a >nul 2>&1
)

start "" "%URL%"

echo [INFO] Starting Vite dev server...
echo Press Ctrl+C inside this window to stop the server.
echo ---------------------------------------------------------
call npm run dev -- --port %PORT% --strictPort

if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] Server exited with code %ERRORLEVEL%.
    goto error_exit
)

echo.
echo [INFO] Server stopped cleanly.
pause
exit /b 0

:error_exit
echo.
echo =========================================================
echo   [FATAL ERROR] Launcher execution failed.
echo   Check the messages above for debug details.
echo =========================================================
pause
exit /b 1
