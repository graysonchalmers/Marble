@echo off
echo Starting Marble Game...
cd /d "%~dp0"

echo Opening browser...
start "" "http://localhost:5173"

echo Starting server...
echo Press Ctrl+C to stop the server.
npm run dev
pause
