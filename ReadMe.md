This markdown document provides an overview of **ComfyUI Studio**, its features, and instructions on how to use it.

---

# ComfyUI Studio

**ComfyUI Studio** is a feature-rich, customizable browser-based frontend for [ComfyUI](https://github.com/comfyanonymous/ComfyUI). It provides a more user-friendly, application-like experience for managing prompts, models, LoRAs, and generations.

## Features

* **Organized Generation Interface:** Manage prompts, models, LoRAs, and generation settings in collapsible cards.
* **Prompt Management:** * **Modifier Highlight:** Built-in highlighting for tag modifier intensities within your prompts based on NovelAI.
* **Tag Autocomplete:** Supports custom CSV files for easy tag suggestion while typing.
* **Quality Tags:** Optional easy insertion of quality-boosting tags for positive/negative prompts.
* **Wildcards & Characters:** Define reusable character profiles and wildcard lists (`{{wc:name}}`) for faster, more creative prompting.
* **Compare:** Generate a grid/xyz plot based on defined parameters like samplers, seed, scheduler, etc.
* **Image Captioning:** Generate tags or natural language captions describing an image of your choosing.
* **Remote Sharing:** Create a password protected cloudflare link for a friend to remote into your studio to use. 



* **Flexible Generation Options:**
* **Multi-mode Generation:** Supports image-to-image (img2img), upscaling, and inpainting.
* **Resolution Management:** Quick-select resolutions or define custom sizes.
* **Advanced Settings:** Includes toggles for V-Prediction, RescaleCFG, and batch processing.


* **Customizable Workspace:**
* **Theming:** Extensive collection of built-in themes (e.g., NovelAI styles, retro XP, bubbly aesthetics) with full CSS variable customization.
* **History Panel:** Keep track of generated images in a session-based history sidebar inspired by NovelAI.


* **Persistent Configuration:** Saves your settings, session data, and preferences to browser `localStorage` for a seamless experience across reloads.
* **File Server:** Includes a lightweight Python-based server (`share.py`) to manage local file saving and folder numbering detection, ensuring generated images are saved sequentially on your machine.

* **Metadata:**
* **Images created within ComfyUI Studio will have their own metadata attached that can be loaded into the studio by uploading the image.
* **The metadata also works for importing into the standard comfyui.
---

## Getting Started

### Prerequisites
1. **ComfyUI:** Ensure [ComfyUI](https://github.com/comfyanonymous/ComfyUI) is installed and operational.
2. **Node.js:** Node.js is required to run the Studio's local server (`server.js`).
3. **Cloudflare Tunnel (optional):** Required only if you want to share your Studio remotely. Install `cloudflared` from [developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and ensure it is available on your system PATH. No Cloudflare account is needed.
Make sure the file is renamed as cloudflared.exe if it isn't already that. 

### Installation & Launch
1. Place the ComfyUI Studio folder anywhere you like. Do not remove or rename any files inside it, including the autocomplete folder.
2. Run `launch.bat`. The first time you run it, you'll be prompted to enter the full path to your ComfyUI startup script (e.g., `run_nvidia_gpu.bat`) — the file itself, not just the folder. This path is saved to `comfyui_path.txt`. Delete that file any time to change it.
3. `launch.bat` will:
   - Start your ComfyUI instance in a separate window.
   - Start the Studio server (`server.js`) on port 3000.
   - Automatically open the Studio interface in your browser at `http://localhost:3000/`.

---

## How to Use

### 1. Connecting
Upon launching, ComfyUI Studio connects to your local ComfyUI instance via WebSocket. Ensure the **URL** in the top bar matches your ComfyUI port (default `http://127.0.0.1:8188`). A green dot in the status indicator confirms a successful connection.

### 2. Generating Images

* **Select Models:** Use the **Model Card** to select your Checkpoint or Diffusion models, VAE, and Text Encoder settings.
* **Construct Prompts:** Enter your positive and negative prompts in the **Prompt Area**.
* Use the **Quality Tags** panel to prepend standard quality keywords to your positive and negative prompts.
* Click `+` to add LoRAs and adjust their strength sliders.
* Configure **Characters** or **Wildcards** to quickly insert complex prompt snippets.


* **Configure Settings:** Adjust steps, sampler, CFG scale, resolution, and batch size.
* **Generate:** Click the **Generate** button. You can monitor progress via the progress bar and a live step preview in the image area.

### 3. Inpainting

1. Upload a base image into the **Base IMG** zone.
2. Enable Inpainting via **Settings** -> **Generation**.
3. Paint a mask on the image using the provided inpainting tools (Brush size, Eraser, Grid Snap).
4. Once the mask is applied and saved, clicking **Generate** will trigger the inpainting workflow, replacing the masked area while keeping the context.

### 4. Saving

* By default, clicking the **Save** button will prompt a standard browser download.
* For automatic organization, configure the **Output Path** in **Settings** -> **Save**. Ensure `share.py` is running so the app can write files directly to your preferred folder with automatic numbering (e.g., `ComfyStudio_00001.png`).

### 5. Customizing

* **Themes:** Open **Settings** -> **Themes** to switch between presets or enable "Customize Theme" to adjust individual colors and fonts in real-time. You can export/import these configurations as JSON files.

### Screenshot
![ui screenshot](UIScreenshot.png)
