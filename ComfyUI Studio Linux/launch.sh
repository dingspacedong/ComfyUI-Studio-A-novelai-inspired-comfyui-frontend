#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# ─── ComfyUI path config ───────────────────────────────────────────────────
CONFIG="$(dirname "$0")/comfyui_path.txt"

if [ -f "$CONFIG" ]; then
    COMFYUI_SCRIPT="$(cat "$CONFIG")"
else
    echo ""
    echo " First-time setup"
    echo " ─────────────────────────────────────────────────────────────────"
    echo " Where is your ComfyUI launch script?"
    echo ""
    echo " Example:"
    echo "   /home/user/ComfyUI/run_comfyui.sh"
    echo ""
    read -rp "  Paste the full path and press Enter: " COMFYUI_SCRIPT
    echo "$COMFYUI_SCRIPT" > "$CONFIG"
    echo ""
    echo " Saved to comfyui_path.txt.  Delete that file any time to change it."
    echo " ─────────────────────────────────────────────────────────────────"
    echo ""
fi

if [ ! -f "$COMFYUI_SCRIPT" ]; then
    echo " ERROR: file not found:"
    echo " $COMFYUI_SCRIPT"
    echo ""
    echo " Delete comfyui_path.txt and re-run to enter a new path."
    exit 1
fi

# ─── Launch ComfyUI in its own terminal window ─────────────────────────────
COMFYUI_DIR="$(dirname "$COMFYUI_SCRIPT")"
echo "Starting ComfyUI..."

# Try common terminal emulators in order; fall back to a background process
if command -v gnome-terminal &>/dev/null; then
    gnome-terminal -- bash -c "cd \"$COMFYUI_DIR\" && bash \"$COMFYUI_SCRIPT\"; exec bash"
elif command -v xterm &>/dev/null; then
    xterm -e "cd \"$COMFYUI_DIR\" && bash \"$COMFYUI_SCRIPT\"" &
elif command -v konsole &>/dev/null; then
    konsole -e bash -c "cd \"$COMFYUI_DIR\" && bash \"$COMFYUI_SCRIPT\"" &
else
    # No GUI terminal available — run ComfyUI in the background
    echo " (No GUI terminal found — launching ComfyUI in the background)"
    (cd "$COMFYUI_DIR" && bash "$COMFYUI_SCRIPT") &
fi

# ─── Launch Studio server ──────────────────────────────────────────────────
echo ""
echo "  Studio   >  http://localhost:3000"
echo "  ComfyUI  >  http://localhost:8188  (proxied via /comfy/*)"
echo ""
echo "  To share remotely: open Settings > Share tab."
echo "  Requires cloudflared on PATH — see Settings > Share for the download link."
echo ""
echo "  Press Ctrl+C to stop the Studio server."
echo ""

sleep 2

# Open browser if possible
if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:3000/ &>/dev/null &
elif command -v open &>/dev/null; then
    open http://localhost:3000/ &
fi

node "$(dirname "$0")/server.js"
