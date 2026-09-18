@echo off
echo Stopping existing Vite dev servers...
taskkill /F /IM node.exe 2>nul

echo Waiting for processes to stop...
timeout /t 2 /nobreak >nul

echo Starting Happy Fish Pond dev server...
cd /d "%~dp0"
npm run dev

pause