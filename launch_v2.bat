@echo off
title Marble Game V2 (dev)
echo ===============================
echo   Marble Game V2 -- port 5174
echo ===============================
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies (first run)...
    call npm install
)

echo Opening browser...
start "" "http://localhost:5174"

echo Starting V2 dev server (Ctrl+C to stop)...
npm run dev -- --port 5174 --strictPort
pause
