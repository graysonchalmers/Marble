@echo off
title Marble Game V2 (dev)
echo =========================================
echo   Marble Game V2 Launch Control Panel
echo   Port: 5174
echo =========================================
cd /d "%~dp0"

:: 1. Verify Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/ before running.
    goto error_exit
)

:: 2. Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies.
        goto error_exit
    )
)

:: 3. Clean up any existing process on port 5174 to prevent duplicates
echo [INFO] Checking for existing instances on port 5174...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /c:":5174 "') do (
    echo [INFO] Terminating old server instance [PID: %%a]...
    taskkill /f /pid %%a >nul 2>&1
)

:: 4. Open browser
echo [INFO] Opening browser to http://localhost:5174 ...
start "" "http://localhost:5174"

:: 5. Start Vite Dev Server with return safety
echo [INFO] Starting Vite dev server...
echo Press Ctrl+C inside this window to stop the server.
echo ---------------------------------------------------------
call npm run dev -- --port 5174 --strictPort

:: 6. Handle unexpected server exits
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
