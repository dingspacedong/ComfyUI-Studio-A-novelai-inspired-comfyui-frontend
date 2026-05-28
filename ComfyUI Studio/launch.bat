@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: ─── ComfyUI path config ───────────────────────────────────────────────────
set "CONFIG=%~dp0comfyui_path.txt"

if exist "%CONFIG%" (
    set /p COMFYUI_BAT=<"%CONFIG%"
) else (
    echo.
    echo  First-time setup
    echo  ─────────────────────────────────────────────────────────────────
    echo  Where is your ComfyUI run_nvidia_gpu.bat?
    echo.
    echo  Example:
    echo    B:\AI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable\run_nvidia_gpu.bat
    echo.
    set /p COMFYUI_BAT="  Paste the full path and press Enter: "
    echo !COMFYUI_BAT!>"%CONFIG%"
    echo.
    echo  Saved to comfyui_path.txt.  Delete that file any time to change it.
    echo  ─────────────────────────────────────────────────────────────────
    echo.
)

if not exist "!COMFYUI_BAT!" (
    echo  ERROR: file not found:
    echo  !COMFYUI_BAT!
    echo.
    echo  Delete comfyui_path.txt and re-run to enter a new path.
    pause
    exit /b 1
)

:: ─── Launch ComfyUI in its own window ──────────────────────────────────────
for %%F in ("!COMFYUI_BAT!") do set "COMFYUI_DIR=%%~dpF"
echo Starting ComfyUI...
start "" /d "!COMFYUI_DIR!" "!COMFYUI_BAT!"

:: ─── Launch Studio server in this window ───────────────────────────────────
echo.
echo  Studio   ^>  http://localhost:3000
echo  ComfyUI  ^>  http://localhost:8188  (proxied via /comfy/*)
echo.
echo  To share remotely: open Settings ^> Share tab.
echo  Requires cloudflared on PATH — see Settings ^> Share for the download link.
echo.
echo  Press Ctrl+C to stop the Studio server.
echo.

timeout /t 2 /nobreak >nul
start "" http://localhost:3000/

node "%~dp0server.js"