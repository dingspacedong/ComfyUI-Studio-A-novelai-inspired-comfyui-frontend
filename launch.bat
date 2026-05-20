@echo off
start "" "path to your comfyui .bat file"
timeout /t 5
start "" http://localhost:3000/
python -m http.server 3000