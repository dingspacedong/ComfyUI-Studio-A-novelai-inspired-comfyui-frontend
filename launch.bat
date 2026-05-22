@echo off
cd /d "%~dp0"

echo Starting ComfyUI...
start "" "C:\Insert Your Path to your .bat HERE \run_nvidia_gpu.bat"

echo Starting Studio file server (port 3000)...
start "ComfyStudio HTTP" python -m http.server 3000

echo Starting share.py save server (port 3001)...
start "ComfyStudio Share" python share.py

echo Waiting for servers to start...
timeout /t 3 /nobreak >nul

echo Opening browser...
start "" http://localhost:3000/

echo.
echo All servers running. Close this window to shut down the Studio servers.
echo (ComfyUI runs in its own window separately.)
pause