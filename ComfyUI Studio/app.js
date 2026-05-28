/* ================================================
   ComfyUI Studio — app.js
   ================================================ */

const state = {
  comfyUrl: 'http://127.0.0.1:8188',
  clientId: crypto.randomUUID(),
  ws: null,
  resW: 512, resH: 512,
  customMode: false,
  seedLocked: false,
  generating: false,
  currentImageUrl: null,
  currentImageFilename: null,
  lastPromptId: null,
  modelType: 'checkpoint',
  availableLoras: [],
  availableUpscaleModels: [],
  characters: [],
  charCounter: 0,

  history: [],
  historyCounter: 0,
  historyPanelOpen: true,

  currentTheme: 'novelai-dark',
  autocompleteData: [],

  qualityTagsEnabled: false,
  qualityTagsText: '',
  negQualityTagsEnabled: false,
  negQualityTagsText: '',

  img2imgFile: null,
  img2imgDataUrl: null,
  pendingMetadata: null,

  resCategory: 'normal',
  resOrient: 'portrait',
  resStandard: 'sdxl',

  lastGenMeta: null,

  // Settings
  vPrediction: false,
  rescaleCFGEnabled: false,
  rescaleCFGMultiplier: 0.7,
  notifSoundEnabled: false,
  // Step preview is always enabled — no longer a user toggle
  stepPreviewEnabled: true,

  // Output paths
  outputPath: '',
  inpaintOutputPath: '',
  autoSaveEnabled: false,
  outputFileCounter: null, // loaded lazily from localStorage

  // Marbles
  marblesEnabled: false,
  marbles: 0,

  // Autocomplete tag formatting
  acEscapeParens: false,
  acReplaceUnderscores: false,

  // Image actions state
  enhancePanelOpen: false,
  upscalePanelOpen: false,
  imageMode: null, // null | 'upscale' | 'enhance'
  enhanceModelType: 'checkpoint', // 'checkpoint' | 'diffusion'

  modifierHighlightEnabled: true,

  // Save preferences — keys match save-chk IDs
  savePrefs: {
    'save-positivePrompt': true,
    'save-negativePrompt': true,
    'save-qualityTags': true,
    'save-characters': true,
    'save-modelType': true,
    'save-checkpointSelect': true,
    'save-diffusionSelect': true,
    'save-vaeSelect': true,
    'save-teSelect': true,
    'save-loras': true,
    'save-sampler': true,
    'save-steps': true,
    'save-cfg': true,
    'save-denoise': true,
    'save-batch': true,
    'save-seed': true,
    'save-resolution': true,
    'save-customRes': true,
    'save-comfyUrl': true,
    'save-img2imgDenoise': true,
    'save-vPrediction': true,
    'save-rescaleCFG': true,
    'save-varSettings': true,
    'save-enhanceSettings': true,
    'save-experimentalToggles': true,
    'save-theme': true,
    'save-panelCollapse': true,
    'save-notes': true,
    'save-wildcards': true,
    'save-promptLibrary': true,
  },

  // Batch tracking
  batchTotal: 1,
  batchCurrent: 0,

  // Focused Inpainting — transient params set before pollForImages, consumed in displayImage
  _focusedInpaintParams: null,

  // Inpaint state
  inpaintEnabled: false,
  inpaintMaskBlob: null,
  inpaintOrigDataUrl: null,
  inpaintOrigFile: null,

  // IP Adapter
  ipAdapterEnabled: false,
  ipaImageDataUrl: null,
  ipaImageName: null,   // uploaded filename returned by ComfyUI

  // ControlNet
  controlNetEnabled: false,
  cnImageDataUrl: null,
  cnImageName: null,    // uploaded filename returned by ComfyUI
};

// ─────────────────────────────────────────────
// RESOLUTION TABLE
// ─────────────────────────────────────────────
const resTable = {
  normal: {
    portrait:  { sdxl:[832,1216],  novelai:[832,1216],  anima:[768,1152]  },
    landscape: { sdxl:[1216,832],  novelai:[1216,832],  anima:[1152,768]  },
    square:    { sdxl:[1024,1024], novelai:[1024,1024], anima:[1024,1024] },
  },
  large: {
    portrait:  { sdxl:[896,1536],  novelai:[896,1536],  anima:[832,1344]  },
    landscape: { sdxl:[1536,896],  novelai:[1536,896],  anima:[1344,832]  },
    square:    { sdxl:[1344,1344], novelai:[1344,1344], anima:[1152,1152] },
  },
  wallpaper: {
    portrait:  { sdxl:[768,1344],  novelai:[768,1344],  anima:[720,1280]  },
    landscape: { sdxl:[1344,768],  novelai:[1344,768],  anima:[1280,720]  },
    square:    { sdxl:[1024,1024], novelai:[1024,1024], anima:[1024,1024] },
  },
  small: {
    portrait:  { sdxl:[512,768],   novelai:[512,768],   anima:[512,768]   },
    landscape: { sdxl:[768,512],   novelai:[768,512],   anima:[768,512]   },
    square:    { sdxl:[512,512],   novelai:[512,512],   anima:[512,512]   },
  },
};

// Marble costs by resolution category
const MARBLE_COSTS = { small:1, normal:5, large:25, wallpaper:35, custom:5 };

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  state.comfyUrl = document.getElementById('comfyUrl').value.replace(/\/$/, '');

  const savedTheme = localStorage.getItem('comfyStudioTheme') || 'novelai-dark';
  applyTheme(savedTheme, null, true);

  // Restore save preferences
  const savedPrefs = localStorage.getItem('comfyStudioSavePrefs');
  if (savedPrefs) {
    try {
      const prefs = JSON.parse(savedPrefs);
      Object.assign(state.savePrefs, prefs);
      Object.entries(state.savePrefs).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.checked = val;
      });
    } catch(e) {}
  }

  // Restore custom theme toggle
  const savedCustomThemeEnabled = localStorage.getItem('comfyStudioCustomThemeEnabled') === 'true';
  if (savedCustomThemeEnabled) {
    state.customThemeEnabled = true;
    const tog = document.getElementById('customThemeToggle');
    if (tog) tog.checked = true;
    const controls = document.getElementById('customThemeControls');
    if (controls) controls.style.display = 'block';
  }

  setupResizeHandle();
  setupCardResizeHandles();
  setupCollapsibleCards();
  setupCSVDrop();
  setupBaseImgZone();
  updateResFromTable();

  // Keep highlight layer width in sync when textarea is resized by drag
  const posTA = document.getElementById('positivePrompt');
  const negTA = document.getElementById('negativePrompt');
  if (posTA && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => updatePromptHighlight('positive')).observe(posTA);
  }
  if (negTA && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => updatePromptHighlight('negative')).observe(negTA);
  }

  const savedSession = loadSessionStart();
  loadModels().then(() => {
    if (savedSession) loadSessionModels(savedSession);
  });
  loadUpscaleModels();

  connectWS();

  document.getElementById('qualityTagsEnabled').addEventListener('change', e => {
    state.qualityTagsEnabled = e.target.checked;
  });
  document.getElementById('qualityTagsText').addEventListener('input', e => {
    state.qualityTagsText = e.target.value;
  });
  document.getElementById('negQualityTagsEnabled').addEventListener('change', e => {
    state.negQualityTagsEnabled = e.target.checked;
  });
  document.getElementById('negQualityTagsText').addEventListener('input', e => {
    state.negQualityTagsText = e.target.value;
  });

  // Restore marbles
  const savedMarbles = localStorage.getItem('comfyStudioMarbles');
  if (savedMarbles !== null) {
    const d = JSON.parse(savedMarbles);
    state.marblesEnabled = d.enabled || false;
    state.marbles = d.amount || 0;
    if (state.marblesEnabled) {
      document.getElementById('marblesToggle').checked = true;
      document.getElementById('marblesDisplay').style.display = 'flex';
      updateMarblesDisplay();
    }
  }

  // Restore notification setting
  const savedNotif = localStorage.getItem('comfyStudioNotif');
  if (savedNotif === 'true') {
    state.notifSoundEnabled = true;
    document.getElementById('notifSoundToggle').checked = true;
  }

  // Step preview is always enabled — no restore needed

  // Restore output path settings
  const savedOutputPaths = localStorage.getItem('comfyStudioOutputPaths');
  if (savedOutputPaths) {
    try {
      const op = JSON.parse(savedOutputPaths);
      state.outputPath        = op.outputPath        || '';
      state.inpaintOutputPath = op.inpaintOutputPath || '';
      state.autoSaveEnabled   = !!op.autoSave;
      const opInput   = document.getElementById('outputPathInput');
      const ipInput   = document.getElementById('inpaintOutputPathInput');
      const asTog     = document.getElementById('autoSaveToggle');
      if (opInput) opInput.value   = state.outputPath;
      if (ipInput) ipInput.value   = state.inpaintOutputPath;
      if (asTog)   asTog.checked   = state.autoSaveEnabled;
    } catch(e) {}
  }

  // Restore modifier highlight setting
  const savedModHighlight = localStorage.getItem('comfyStudioModHighlight');
  if (savedModHighlight === 'false') {
    state.modifierHighlightEnabled = false;
    const tog = document.getElementById('modifierHighlightToggle');
    if (tog) tog.checked = false;
  }

  // Auto-scan for CSV files
  scanAutoCompleteFolder();

  // Restore autocomplete tag-formatting settings
  const savedAcSettings = localStorage.getItem('comfyStudioAcSettings');
  if (savedAcSettings) {
    try {
      const ac = JSON.parse(savedAcSettings);
      state.acEscapeParens = !!ac.escapeParens;
      state.acReplaceUnderscores = !!ac.replaceUnderscores;
      const epTog = document.getElementById('acEscapeParensToggle');
      if (epTog) epTog.checked = state.acEscapeParens;
      const usTog = document.getElementById('acUnderscoreToggle');
      if (usTog) usTog.checked = state.acReplaceUnderscores;
      // Restore the last-used autocomplete source after the folder scan populates the <select>
      if (ac.source && ac.source !== 'none') {
        state._pendingAcSource = ac.source;
      }
    } catch(e) {}
  }

  // Sync theme color pickers to current theme
  syncThemeColorPickers();

  // Load wildcards
  loadWildcards();

  // Restore save metadata setting (default true)
  const savedSaveMeta = localStorage.getItem('comfyStudioSaveMeta');
  if (savedSaveMeta === 'false') {
    state.saveMetadataEnabled = false;
    const tog = document.getElementById('saveMetadataToggle');
    if (tog) tog.checked = false;
  }

  // Restore notes feature
  const savedNotes = localStorage.getItem('comfyStudioNotes');
  if (savedNotes === 'true') {
    const tog = document.getElementById('notesEnabledToggle');
    if (tog) { tog.checked = true; toggleNotesFeature(true); }
  }
  // Restore notes content
  const notesContent = localStorage.getItem('comfyStudioNotes_content');
  if (notesContent) {
    const ta = document.getElementById('notesTextarea');
    if (ta) ta.value = notesContent;
  }

  // Restore hide characters
  const savedHideChars = localStorage.getItem('comfyStudioHideChars');
  if (savedHideChars === 'true') {
    const tog = document.getElementById('hideCharactersToggle');
    if (tog) { tog.checked = true; toggleHideCharacters(true); }
  }
});

// ─────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────
function connectWS() {
  if (state.ws) { try { state.ws.close(); } catch(e){} }
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  dot.className = 'status-dot';
  txt.textContent = 'Connecting…';
  const isLocalWS = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1';
  let wsUrl;
  if (isLocalWS) {
    wsUrl = state.comfyUrl.replace(/^http/, 'ws') + '/ws?clientId=' + state.clientId;
  } else {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = proto + '//' + location.host + '/comfy/ws?clientId=' + state.clientId;
  }
  try { state.ws = new WebSocket(wsUrl); }
  catch(e) { dot.className = 'status-dot error'; txt.textContent = 'Cannot connect'; return; }
  state.ws.addEventListener('open', () => {
    dot.className = 'status-dot connected'; txt.textContent = 'Connected';
  });
  state.ws.addEventListener('close', () => {
    dot.className = 'status-dot'; txt.textContent = 'Reconnecting…';
    setTimeout(() => {
      if (state.ws?.readyState !== WebSocket.OPEN) {
        dot.className = 'status-dot error'; txt.textContent = 'Disconnected';
      }
    }, 3000);
    setTimeout(connectWS, 6000);
  });
  state.ws.addEventListener('error', () => {
    // Suppress — close handler sets the visible status after a grace period
  });
  state.ws.addEventListener('message', onWSMessage);
}

function reconnect() {
  state.comfyUrl = document.getElementById('comfyUrl').value.replace(/\/$/, '');
  connectWS();
  loadModels();
}

// ─────────────────────────────────────────────
// REMOTE-SAFE COMFYUI ACCESS HELPERS
// When accessed remotely (Cloudflare tunnel etc.) the browser cannot reach
// 127.0.0.1:8188. These helpers route all ComfyUI traffic through /comfy/*.
// ─────────────────────────────────────────────
function _isLocalAccess() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1';
}

function comfyFetch(urlOrPath, opts) {
  if (_isLocalAccess()) return fetch(urlOrPath, opts);
  let p = urlOrPath;
  try { const u = new URL(urlOrPath); p = u.pathname + (u.search || ''); } catch(e) {}
  return fetch('/comfy' + p, opts);
}

function comfyViewUrl(params) {
  if (_isLocalAccess()) return state.comfyUrl + '/view?' + params;
  return '/comfy/view?' + params;
}

function onWSMessage(evt) {
  // ComfyUI sends binary blobs for latent previews.
  // Format: [4 bytes event-type uint32 LE] [4 bytes image-format uint32 LE] [JPEG bytes...]
  // Some versions use only a 4-byte header. We detect the JPEG magic (0xFF 0xD8) to find the
  // true start of image data, making this robust across ComfyUI versions.
  if (evt.data instanceof Blob) {
    if (!state.stepPreviewEnabled) return;
    evt.data.arrayBuffer().then(buf => {
      const arr = new Uint8Array(buf);

      // Find the JPEG magic bytes (0xFF 0xD8) in the first 16 bytes
      let imgStart = -1;
      for (let i = 0; i <= Math.min(16, arr.length - 2); i++) {
        if (arr[i] === 0xFF && arr[i + 1] === 0xD8) { imgStart = i; break; }
      }
      if (imgStart === -1) return; // not a JPEG preview — skip

      const imageBlob = new Blob([arr.subarray(imgStart)], { type: 'image/jpeg' });
      const url = URL.createObjectURL(imageBlob);
      const previewImg = document.getElementById('stepPreviewImg');
      if (previewImg) {
        if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
        previewImg.src = url;
        previewImg.style.display = 'block';
        const placeholder = document.getElementById('imgPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
        const overlay = document.getElementById('genOverlay');
        if (overlay) overlay.classList.add('has-preview');
      }
    }).catch(() => {}); // ignore parse errors on non-image binary messages
    return;
  }

  let data;
  try { data = JSON.parse(evt.data); } catch(e) { return; }

  if (data.type === 'progress') {
    const { value, max } = data.data;
    setProgress(value, max);
    document.getElementById('genOverlayText').textContent = `Step ${value} / ${max}`;
  }

  if (data.type === 'executing') {
    if (data.data.node === null) {
      const wsPromptId = data.data.prompt_id;
      if (_isLocalAccess()) {
        // Local host: existing path
        if (wsPromptId === state.lastPromptId) fetchLatestImage();
      } else {
        // Remote client: state.lastPromptId is never set on this browser (host set it).
        // Read prompt_id directly from the WS message, fetch metadata the host pushed,
        // then poll for the finished image — same as the local path does.
        // Persistent Set guard: once a prompt_id is handled it is never re-processed,
        // regardless of how many executing/null messages ComfyUI sends for it.
        if (!state._remoteHandledPrompts) state._remoteHandledPrompts = new Set();

        if (wsPromptId && !state._remoteHandledPrompts.has(wsPromptId)) {
          state._remoteHandledPrompts.add(wsPromptId);
          // Only update lastPromptId/lastGenMeta if generate() hasn't already set them
          // (generate() runs when the remote user clicks Generate themselves).
          if (!state.lastPromptId) state.lastPromptId = wsPromptId;

          // Retry fetching metadata until the host's /meta/push has landed.
          // pollForImages is only called after metadata is confirmed (or timed out)
          // so that embedPNGMetadata always has valid data to work with.
          (async () => {
            for (let i = 0; i < 5; i++) {
              if (i > 0) await sleep(2000);
              try {
                const r = await fetch('/meta/get?prompt_id=' + encodeURIComponent(wsPromptId));
                if (r.ok) { const d = await r.json(); if (d && d.meta) { state.lastGenMeta = d.meta; break; } }
              } catch(e) {}
            }
            await pollForImages(wsPromptId, 1);
          })();
        }
      }
    }
  }

  // ComfyUI fires execution_error when a node throws during execution
  if (data.type === 'execution_error') {
    if (data.data?.prompt_id === state.lastPromptId || !state.lastPromptId) {
      const nodeType  = data.data?.exception_type  || '';
      const nodeMsg   = data.data?.exception_message || 'Unknown error';
      const nodeClass = data.data?.node_type        || '';
      showToast('error', 'Generation Error',
        (nodeClass ? `[${nodeClass}] ` : '') + nodeMsg, 0);
      showGenOverlay(false);
      clearProgress();
      clearStepPreview();
      removePendingHistoryItems();
      resetBtn();
    }
  }

  // ComfyUI fires execution_interrupted when the user or server interrupts
  if (data.type === 'execution_interrupted') {
    if (data.data?.prompt_id === state.lastPromptId || !state.lastPromptId) {
      showGenOverlay(false);
      clearProgress();
      clearStepPreview();
      removePendingHistoryItems();
      resetBtn();
      showToast('info', 'Interrupted', 'Generation was stopped.', 3000);
    }
  }
}

// ─────────────────────────────────────────────
// TOAST NOTIFICATION SYSTEM
// ─────────────────────────────────────────────
// showToast(type, title, message, duration)
// type: 'error' | 'success' | 'info'
// duration: ms to auto-dismiss (0 = manual close only)
function showToast(type, title, message, duration = 6000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  // Don't use ✕ for error icon since the close button already shows ✕
  const icons = { error: '⚠', success: '✓', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="dismissToast(this.closest('.toast'))">✕</button>
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
  return toast;
}

function dismissToast(toast) {
  if (!toast || toast.classList.contains('removing')) return;
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

function clearStepPreview() {
  const previewImg = document.getElementById('stepPreviewImg');
  if (!previewImg) return;
  if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
  previewImg.src = '';
  previewImg.style.display = 'none';
  // Restore full overlay opacity
  const overlay = document.getElementById('genOverlay');
  if (overlay) overlay.classList.remove('has-preview');
}


// ─────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────
function setProgress(value, max) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  // Panel-footer bar (existing)
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${value}/${max}`;
  // Image-area overlay bar
  const gpo = document.getElementById('genProgressOverlay');
  if (gpo) gpo.style.display = 'flex';
  const gpf = document.getElementById('genProgressFill');
  if (gpf) gpf.style.width = pct + '%';
  const gpt = document.getElementById('genProgressText');
  if (gpt) gpt.textContent = `${value}/${max}`;
}
function clearProgress() {
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressText').textContent = '';
  const gpo = document.getElementById('genProgressOverlay');
  if (gpo) gpo.style.display = 'none';
  const gpf = document.getElementById('genProgressFill');
  if (gpf) gpf.style.width = '0%';
  const gpt = document.getElementById('genProgressText');
  if (gpt) gpt.textContent = '';
}

// ─────────────────────────────────────────────
// MODEL LOADING
// ─────────────────────────────────────────────
async function loadModels() {
  state.comfyUrl = document.getElementById('comfyUrl').value.replace(/\/$/, '');
  try {
    const [checkpoints, diffusions, vaes, loras, textEncoders, ipaModels, ipaClips, cnModels] = await Promise.all([
      fetchList('CheckpointLoaderSimple', 'ckpt_name'),
      fetchList('UNETLoader', 'unet_name'),
      fetchList('VAELoader', 'vae_name'),
      fetchList('LoraLoader', 'lora_name'),
      fetchList('CLIPLoader', 'clip_name'),
      fetchList('IPAdapterModelLoader', 'ipadapter_file').catch(() => []),
      fetchList('CLIPVisionLoader', 'clip_name').catch(() => []),
      fetchList('ControlNetLoader', 'control_net_name').catch(() => []),
    ]);
    populateSel('checkpointSelect', checkpoints);
    populateSel('diffusionSelect', diffusions);
    populateSel('vaeSelect', vaes);
    populateSel('teSelect', ['none', ...textEncoders]);
    // Also populate enhance model selects
    populateSel('enhanceCheckpointSelect', checkpoints);
    populateSel('enhanceDiffusionSelect', diffusions);
    populateSel('enhanceVaeSelect', vaes);
    populateSel('enhanceTeSelect', ['none', ...textEncoders]);
    state.availableLoras = loras;
    // IP Adapter + ControlNet
    if (ipaModels.length)  populateSel('ipaModelSelect',  ipaModels);
    if (ipaClips.length)   populateSel('ipaClipSelect',   ipaClips);
    if (cnModels.length)   populateSel('cnModelSelect',   cnModels);
    // Re-init search on existing lora items with refreshed list
    document.querySelectorAll('.lora-item').forEach(item => {
      const cur = item.querySelector('.lora-sel').value;
      setupLoraSearch(item, loras);
      if (cur) {
        item.querySelector('.lora-sel').value = cur;
        const si = item.querySelector('.lora-search-input');
        if (si) si.value = cur;
      }
    });
  } catch(e) {
    console.warn('Model load failed:', e);
    populateSel('checkpointSelect', ['(ComfyUI not reachable)']);
  }
}

async function loadUpscaleModels() {
  // Hardcoded list of models we know you have
  const manualModels = [
    '4x_NMKD-Superscale-SP_178000_G.pth',
    'OmniSR_X2_DIV2K.safetensors',
    'OmniSR_X3_DIV2K.safetensors',
    'OmniSR_X4_DIV2K.safetensors',
    'RealESRGAN_x4plus.pth',
    'RealESRGAN_x4plus_anime_6B.pth'
  ];

  console.log('Using hardcoded model list.');
  state.availableUpscaleModels = manualModels;
  populateSel('upscaleModelSelect', manualModels);
  populateSel('enhanceUpscaleModel', manualModels);
}

async function fetchList(node, param) {
  const res = await comfyFetch(`${state.comfyUrl}/object_info/${node}`);
  const json = await res.json();
  return json[node]?.input?.required?.[param]?.[0] ?? [];
}

function populateSel(idOrEl, items) {
  const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!el) return;
  el.innerHTML = '';
  
  // Ensure items is an array before calling forEach
  const itemList = Array.isArray(items) ? items : [items];
  
  itemList.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  });
}

// ─────────────────────────────────────────────
// MODEL TYPE TOGGLE
// ─────────────────────────────────────────────
function switchModelType(type, btn) {
  state.modelType = type;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('checkpointRow').classList.toggle('hidden', type !== 'checkpoint');
  document.getElementById('diffusionRow').classList.toggle('hidden', type !== 'diffusion');
}

function switchEnhanceModelType(type, btn) {
  state.enhanceModelType = type;
  // Update only the enhance segmented buttons (not main model buttons)
  const modelCard = btn.closest('.enhance-model-card');
  if (modelCard) {
    modelCard.querySelectorAll('.enh-seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const ckptRow = document.getElementById('enhanceCheckpointRow');
  const diffRow = document.getElementById('enhanceDiffusionRow');
  if (ckptRow) ckptRow.classList.toggle('hidden', type !== 'checkpoint');
  if (diffRow) diffRow.classList.toggle('hidden', type !== 'diffusion');
}

// ─────────────────────────────────────────────
// PROMPT TABS
// ─────────────────────────────────────────────
function switchPromptTab(tab, btn) {
  document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.prompt-pane').forEach(p => p.classList.remove('active-pane'));
  document.getElementById('prompt' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active-pane');
}

// ─────────────────────────────────────────────
// PROMPT INTENSITY HIGHLIGHTING
// ─────────────────────────────────────────────
function toggleModifierHighlight(enabled) {
  state.modifierHighlightEnabled = enabled;
  // Sync the settings toggle
  const settingsTog = document.getElementById('modifierHighlightToggle');
  if (settingsTog) settingsTog.checked = enabled;
  localStorage.setItem('comfyStudioModHighlight', enabled);
  // Clear or re-render highlights — main prompts
  ['positive', 'negative'].forEach(side => {
    const layer = document.getElementById(side === 'positive' ? 'highlightLayerPositive' : 'highlightLayerNegative');
    if (!layer) return;
    if (!enabled) { layer.innerHTML = ''; } else { updatePromptHighlight(side); }
  });
  // Clear or re-render enhance prompt highlights
  ['pos', 'neg'].forEach(which => {
    const layer = document.getElementById(which === 'pos' ? 'highlightLayerEnhancePos' : 'highlightLayerEnhanceNeg');
    if (!layer) return;
    if (!enabled) { layer.innerHTML = ''; } else { updateEnhanceHighlight(which); }
  });
}

function updatePromptHighlight(side) {
  const ta = document.getElementById(side === 'positive' ? 'positivePrompt' : 'negativePrompt');
  const layer = document.getElementById(side === 'positive' ? 'highlightLayerPositive' : 'highlightLayerNegative');
  if (!ta || !layer) return;

  if (!state.modifierHighlightEnabled) {
    layer.innerHTML = '';
    return;
  }

  const text = ta.value;
  const escaped = escapeHTMLPreserveStructure(text);
  layer.innerHTML = escaped;
  // Mirror exact computed style so newlines render at the same height
  const cs = getComputedStyle(ta);
  layer.style.fontSize = cs.fontSize;
  layer.style.lineHeight = cs.lineHeight;
  layer.style.fontFamily = cs.fontFamily;
  layer.style.letterSpacing = cs.letterSpacing;
  layer.style.wordSpacing = cs.wordSpacing;
  layer.style.tabSize = cs.tabSize;
  // Mirror width to account for scrollbar space
  layer.style.width = ta.clientWidth + 'px';
  syncHighlightScroll(side);
}
 
function escapeHTMLPreserveStructure(text) {
  // Build highlighted HTML for the overlay layer.
  // Rules:
  //   \( and \) are escaped parens (e.g. "loona \(helluva boss\)") — plain text, never group boundaries.
  //   Unescaped ( ... :number ) patterns are modifier groups — wrapped in a highlight span.
  //   Everything else is HTML-escaped plain text.
  let result = '';
  let i = 0;

  function htmlEscapeChar(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    return ch;
  }

  while (i < text.length) {
    // Escaped paren — \( or \) — emit both chars as plain text, never a group boundary
    if (text[i] === '\\' && i + 1 < text.length && (text[i+1] === '(' || text[i+1] === ')')) {
      result += htmlEscapeChar(text[i]) + htmlEscapeChar(text[i+1]);
      i += 2;
      continue;
    }

    // Unescaped open paren — try to match a modifier group (content:number)
    if (text[i] === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        // Skip escape sequences so \( \) don't affect depth counting
        if (text[j] === '\\' && j + 1 < text.length && (text[j+1] === '(' || text[j+1] === ')')) {
          j += 2;
          continue;
        }
        if (text[j] === '(') depth++;
        else if (text[j] === ')') depth--;
        j++;
      }

      if (depth === 0) {
        const inner = text.slice(i + 1, j - 1);
        const m = inner.match(/^([\s\S]*):(\s*[\d.]+\s*)$/);
        if (m) {
          const weight = parseFloat(m[2]);
          const cls = weight > 1 ? 'mod-high' : (weight === 1 ? 'mod-mid' : 'mod-low');
          const groupText = '(' + inner + ')';
          result += `<span class="${cls}">${groupText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
          i = j;
          continue;
        }
      }
      // Not a modifier group — emit the ( as plain text and advance one char only
      result += '(';
      i++;
      continue;
    }

    // Newline
    if (text[i] === '\n') { result += '\n'; i++; continue; }

    // All other chars — HTML escape
    result += htmlEscapeChar(text[i]);
    i++;
  }

  // Trailing space so the layer height stays in sync with the textarea
  return result + ' ';
}
 
function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
 
function syncHighlightScroll(side) {
  const ta = document.getElementById(side === 'positive' ? 'positivePrompt' : 'negativePrompt');
  const layer = document.getElementById(side === 'positive' ? 'highlightLayerPositive' : 'highlightLayerNegative');
  if (!ta || !layer) return;
  layer.scrollTop = ta.scrollTop;
  layer.scrollLeft = ta.scrollLeft;
}

function syncCharHighlightScroll(ta) {
  const wrap = ta.closest('.char-prompt-wrap');
  if (!wrap) return;
  const layer = wrap.querySelector('.char-highlight-layer');
  if (!layer) return;
  layer.scrollTop  = ta.scrollTop;
  layer.scrollLeft = ta.scrollLeft;
}
// ─────────────────────────────────────────────
function setupCollapsibleCards() {
  const saved = JSON.parse(localStorage.getItem('comfyCollapseState') || '{}');
  Object.entries(saved).forEach(([id, collapsed]) => {
    const card = document.getElementById(id);
    if (card && collapsed) card.classList.add('collapsed');
  });
}

function toggleCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.toggle('collapsed');
  const saved = JSON.parse(localStorage.getItem('comfyCollapseState') || '{}');
  saved[cardId] = card.classList.contains('collapsed');
  localStorage.setItem('comfyCollapseState', JSON.stringify(saved));
}

// ─────────────────────────────────────────────
// CHARACTERS
// ─────────────────────────────────────────────
function addCharacter() {
  state.charCounter++;
  const id = state.charCounter;
  const keyword = `{char:${id}}`;
  state.characters.push({ id, enabled: true, keyword, prompt: '' });

  const empty = document.getElementById('charEmpty');
  if (empty) empty.style.display = 'none';
  document.getElementById('charHintBox').style.display = 'flex';

  const tpl = document.getElementById('charTemplate');
  const clone = tpl.content.cloneNode(true);
  const item = clone.querySelector('.char-item');
  item.dataset.charid = id;
  clone.querySelector('.char-label').textContent = `Character ${id}`;

  const kwInput = clone.querySelector('.char-keyword-input');
  kwInput.value = keyword;
  kwInput.addEventListener('input', () => {
    const ch = state.characters.find(c => c.id === id);
    if (ch) ch.keyword = kwInput.value;
  });

  const ta = clone.querySelector('.char-ta');
  ta.addEventListener('input', () => {
    const ch = state.characters.find(c => c.id === id);
    if (ch) ch.prompt = ta.value;
    updateCharHighlight(ta);
  });
  ta.addEventListener('scroll', () => syncCharHighlightScroll(ta));

  document.getElementById('characterList').appendChild(clone);

  // After appending, wire up autocomplete on the real DOM element
  const realItem = document.querySelector(`.char-item[data-charid="${id}"]`);
  if (realItem) {
    const realTa = realItem.querySelector('.char-ta');
    setupCharAutocomplete(realTa);
  }
  updateCharReorderBtns();
}

function updateCharHighlight(ta) {
  const wrap = ta.closest('.char-prompt-wrap');
  if (!wrap) return;
  const layer = wrap.querySelector('.char-highlight-layer');
  if (!layer) return;
  if (!state.modifierHighlightEnabled) { layer.innerHTML = ''; return; }
  layer.innerHTML = escapeHTMLPreserveStructure(ta.value);
  const cs = getComputedStyle(ta);
  layer.style.fontSize    = cs.fontSize;
  layer.style.lineHeight  = cs.lineHeight;
  layer.style.fontFamily  = cs.fontFamily;
  layer.style.letterSpacing = cs.letterSpacing;
  layer.style.width = ta.clientWidth + 'px';
  syncCharHighlightScroll(ta);
}

let _charAcHandlers = [];

function setupCharAutocomplete(ta) {
  if (!ta) return;
  let dropdown = null;

  function showAC(matches) {
    hideAC();
    if (!matches.length) return;
    dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-list';
    matches.forEach((m, i) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item' + (i === 0 ? ' active' : '');
      item.textContent = m;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        acceptTag(m);
        hideAC();
      });
      dropdown.appendChild(item);
    });
    const rect = ta.getBoundingClientRect();
    dropdown.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom+2}px;width:${rect.width}px`;
    document.body.appendChild(dropdown);
  }

  function hideAC() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  function setACActive(items, idx) {
    items.forEach((it, i) => it.classList.toggle('active', i === idx));
  }

  function acceptTag(tag) {
    const cur = getTagAtCursor(ta);
    if (!cur) return;
    const start = ta.selectionStart - cur.length;
    const end   = ta.selectionStart;
    ta.value = ta.value.slice(0, start) + tag + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + tag.length;
    updateCharHighlight(ta);
  }

  const onInput = () => {
    if (!state.autocompleteData.length) return;
    const cur = getTagAtCursor(ta);
    if (!cur || cur.length < 2) { hideAC(); return; }
    const matches = state.autocompleteData
      .filter(t => t.toLowerCase().startsWith(cur.toLowerCase()))
      .slice(0, 8);
    if (!matches.length) { hideAC(); return; }
    showAC(matches);
  };

  const onKeydown = e => {
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.autocomplete-item');
    const active = dropdown.querySelector('.autocomplete-item.active');
    let idx = [...items].indexOf(active);
    if (e.key === 'ArrowDown')  { e.preventDefault(); setACActive(items, Math.min(idx+1, items.length-1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setACActive(items, Math.max(idx-1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const a = dropdown.querySelector('.autocomplete-item.active');
      if (a) { e.preventDefault(); acceptTag(a.textContent); hideAC(); }
    } else if (e.key === 'Escape') hideAC();
  };

  const onBlur = () => setTimeout(hideAC, 150);

  ta.addEventListener('input', onInput);
  ta.addEventListener('keydown', onKeydown);
  ta.addEventListener('blur', onBlur);
  _charAcHandlers.push([ta, 'input', onInput], [ta, 'keydown', onKeydown], [ta, 'blur', onBlur]);
}

function removeCharacter(btn) {
  const item = btn.closest('.char-item');
  const id = parseInt(item.dataset.charid);
  showConfirm(`Delete Character ${id}? This cannot be undone.`, () => {
    state.characters = state.characters.filter(c => c.id !== id);
    item.remove();
    if (document.querySelectorAll('.char-item').length === 0) {
      document.getElementById('charEmpty').style.display = '';
      document.getElementById('charHintBox').style.display = 'none';
    }
  });
}

function moveCharacter(btn, dir) {
  const item = btn.closest('.char-item');
  const list = item.parentElement;
  const items = [...list.querySelectorAll('.char-item')];
  const i = items.indexOf(item);
  const j = i + dir;
  if (j < 0 || j >= items.length) return;
  // Move in DOM
  if (dir === -1) list.insertBefore(item, items[j]);
  else            list.insertBefore(items[j], item);
  // Sync state.characters order to DOM order
  const newOrder = [...list.querySelectorAll('.char-item')].map(el => parseInt(el.dataset.charid));
  state.characters.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
  // Update disabled state of reorder buttons
  updateCharReorderBtns();
}

function updateCharReorderBtns() {
  const items = [...document.querySelectorAll('#characterList .char-item')];
  items.forEach((item, i) => {
    const btns = item.querySelectorAll('.char-reorder-btn');
    if (btns[0]) btns[0].disabled = i === 0;
    if (btns[1]) btns[1].disabled = i === items.length - 1;
  });
}

function toggleCharacter(btn) {
  const item = btn.closest('.char-item');
  const id = parseInt(item.dataset.charid);
  const ch = state.characters.find(c => c.id === id);
  if (!ch) return;
  ch.enabled = !ch.enabled;
  item.classList.toggle('disabled', !ch.enabled);
  btn.title = ch.enabled ? 'Disable' : 'Enable';
  btn.textContent = ch.enabled ? '◉' : '◎';
}

// Build the final positive prompt
function buildPositivePrompt() {
  let positive = document.getElementById('positivePrompt').value;

  // Prepend quality tags (positive only), with trailing comma
  if (state.qualityTagsEnabled && state.qualityTagsText.trim()) {
    const qtags = state.qualityTagsText.trim().replace(/,\s*$/, '');
    positive = qtags + ', ' + positive;
  }

  // Replace character keywords
  state.characters.forEach(ch => {
    if (!ch.enabled) return;
    const item = document.querySelector(`.char-item[data-charid="${ch.id}"]`);
    if (!item) return;
    const kw = item.querySelector('.char-keyword-input').value.trim() || ch.keyword;
    const prompt = item.querySelector('.char-ta').value.trim();
    if (kw && prompt) {
      positive = positive.replaceAll(kw, prompt);
    }
  });

  // Resolve {{wc:name}} wildcard keywords — each replaced with a single random tag
  positive = resolveWildcards(positive);

  return positive;
}

// Build the final negative prompt
function buildNegativePrompt() {
  let negative = document.getElementById('negativePrompt').value;
  // Prepend negative quality tags (negative only), with trailing comma
  if (state.negQualityTagsEnabled && state.negQualityTagsText.trim()) {
    const ntags = state.negQualityTagsText.trim().replace(/,\s*$/, '');
    negative = ntags + ', ' + negative;
  }
  // Resolve wildcards in negative prompt too
  negative = resolveWildcards(negative);
  return negative;
}

// ─────────────────────────────────────────────
// LoRAs
// ─────────────────────────────────────────────
function addLora() {
  const list = document.getElementById('loraList');
  const empty = list.querySelector('.empty-hint');
  if (empty) empty.remove();

  const tpl = document.getElementById('loraTemplate');
  const clone = tpl.content.cloneNode(true);
  list.appendChild(clone);

  // Wire up the search for the newly added item
  const item = list.querySelector('.lora-item:last-child');
  setupLoraSearch(item, state.availableLoras);
}

function setupLoraSearch(item, loras) {
  // Clone inputs to remove any previously attached listeners (prevents stale-closure duplicates
  // when loadModels calls setupLoraSearch again with a refreshed list).
  const oldInput    = item.querySelector('.lora-search-input');
  const oldDropdown = item.querySelector('.lora-search-dropdown');
  const hidden      = item.querySelector('.lora-sel');

  const input    = oldInput.cloneNode(true);
  const dropdown = oldDropdown.cloneNode(false); // shallow — items are re-built each time
  oldInput.parentNode.replaceChild(input, oldInput);
  oldDropdown.parentNode.replaceChild(dropdown, oldDropdown);

  // Pre-select first lora if nothing is selected yet
  if (loras.length > 0 && !hidden.value) {
    hidden.value = loras[0];
    input.value  = loras[0];
  }

  function buildDropdown(filter) {
    const q = filter.trim().toLowerCase();
    let matches;
    if (!q) {
      matches = loras.slice(0, 16);
    } else {
      // Score: starts-with gets priority, then contains; alphabetical within each tier
      const startsWith = loras.filter(l => l.toLowerCase().startsWith(q));
      const contains   = loras.filter(l => !l.toLowerCase().startsWith(q) && l.toLowerCase().includes(q));
      matches = [...startsWith, ...contains].slice(0, 16);
    }

    if (!matches.length) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = '';
    matches.forEach((name, i) => {
      const row = document.createElement('div');
      row.className = 'lora-dd-item' + (i === 0 ? ' active' : '');
      row.textContent = name;
      row.addEventListener('mousedown', e => {
        e.preventDefault();
        hidden.value = name;
        input.value  = name;
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(row);
    });
    dropdown.style.display = 'block';
  }

  function getActive() {
    return dropdown.querySelector('.lora-dd-item.active');
  }

  input.addEventListener('focus', () => buildDropdown(input.value));
  input.addEventListener('input', () => {
    hidden.value = '';
    buildDropdown(input.value);
  });
  input.addEventListener('keydown', e => {
    if (dropdown.style.display === 'none') return;
    const items = [...dropdown.querySelectorAll('.lora-dd-item')];
    const idx   = items.indexOf(getActive());
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items.forEach(it => it.classList.remove('active'));
      const next = items[Math.min(idx + 1, items.length - 1)];
      if (next) { next.classList.add('active'); next.scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items.forEach(it => it.classList.remove('active'));
      const prev = items[Math.max(idx - 1, 0)];
      if (prev) { prev.classList.add('active'); prev.scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const active = getActive();
      if (active) {
        e.preventDefault();
        hidden.value = active.textContent;
        input.value  = active.textContent;
        dropdown.style.display = 'none';
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      if (hidden.value) input.value = hidden.value;
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      dropdown.style.display = 'none';
      // Snap to best match if user typed something but didn't pick
      if (!hidden.value && input.value) {
        const q = input.value.toLowerCase();
        const match = loras.find(l => l.toLowerCase() === q)
                   || loras.find(l => l.toLowerCase().startsWith(q))
                   || loras.find(l => l.toLowerCase().includes(q));
        if (match) { hidden.value = match; input.value = match; }
        else if (loras.length) { hidden.value = loras[0]; input.value = loras[0]; }
      } else if (!hidden.value && loras.length) {
        hidden.value = loras[0]; input.value = loras[0];
      }
    }, 150);
  });
}

function removeLora(btn) {
  btn.closest('.lora-item').remove();
  if (document.querySelectorAll('.lora-item').length === 0) {
    document.getElementById('loraList').innerHTML = '<p class="empty-hint">No LoRAs — click ＋ to add</p>';
  }
}

function toggleLora(btn) {
  const item = btn.closest('.lora-item');
  const enabled = item.classList.toggle('disabled');
  btn.title = item.classList.contains('disabled') ? 'Enable' : 'Disable';
  btn.textContent = item.classList.contains('disabled') ? '◎' : '◉';
}

function loraSliderInput(slider) {
  slider.closest('.lora-strength').querySelector('.lora-num').value = slider.value;
}
function loraNumInput(num) {
  num.closest('.lora-strength').querySelector('.lora-slider').value = num.value;
}
function getActiveLoRAs() {
  const out = [];
  document.querySelectorAll('.lora-item').forEach(item => {
    if (item.classList.contains('disabled')) return; // skip disabled loras
    const name = item.querySelector('.lora-sel').value;
    const strength = parseFloat(item.querySelector('.lora-num').value ?? 1);
    if (name) out.push({ name, strength });
  });
  return out;
}

// ─────────────────────────────────────────────
// RESOLUTION
// ─────────────────────────────────────────────
function onResCategoryChange() {
  state.resCategory = document.getElementById('resCategorySelect').value;
  const orientWrap = document.getElementById('resOrientWrap');
  const standardWrap = document.getElementById('resStandardWrap');
  const customWrap = document.getElementById('customResWrap');

  if (state.resCategory === 'custom') {
    orientWrap.style.display = 'none';
    standardWrap.style.display = 'none';  // Bug fix: hide standard dropdown for custom
    customWrap.classList.add('open');
    updateCustomRes();
  } else {
    orientWrap.style.display = '';
    standardWrap.style.display = '';
    customWrap.classList.remove('open');
    updateResFromTable();
  }
}

function onResOrientChange() {
  state.resOrient = document.getElementById('resOrientSelect').value;
  updateResFromTable();
}
function onResStandardChange() {
  state.resStandard = document.getElementById('resStandardSelect').value;
  updateResFromTable();
}
function updateResFromTable() {
  if (state.resCategory === 'custom') return;
  const entry = resTable[state.resCategory]?.[state.resOrient]?.[state.resStandard];
  if (entry) { state.resW = entry[0]; state.resH = entry[1]; updateResDisplay(); }
}
function updateCustomRes() {
  state.resW = parseInt(document.getElementById('customW').value) || 512;
  state.resH = parseInt(document.getElementById('customH').value) || 512;
  updateResDisplay();
}

function flipCustomRes() {
  const wEl = document.getElementById('customW');
  const hEl = document.getElementById('customH');
  const tmp = wEl.value;
  wEl.value = hEl.value;
  hEl.value = tmp;
  updateCustomRes();
}
function updateResDisplay() {
  document.getElementById('currentRes').textContent = `${state.resW} × ${state.resH}`;
}

// ─────────────────────────────────────────────
// SLIDERS
// ─────────────────────────────────────────────
function syncSlider(name) {
  const s = document.getElementById(name + 'Slider');
  const n = document.getElementById(name + 'Num');
  if (s && n) n.value = s.value;
}
function syncNum(name) {
  const s = document.getElementById(name + 'Slider');
  const n = document.getElementById(name + 'Num');
  if (s && n) s.value = n.value;
}

// ─────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────
function randomSeed() {
  document.getElementById('seedInput').value = Math.floor(Math.random() * 2 ** 32);
}
function toggleLockSeed() {
  state.seedLocked = !state.seedLocked;
  const btn = document.getElementById('lockSeedBtn');
  btn.textContent = state.seedLocked ? '🔒' : '🔓';
  btn.title = state.seedLocked ? 'Seed locked' : 'Seed unlocked';
  btn.classList.toggle('locked', state.seedLocked);
}

// ─────────────────────────────────────────────
// QUALITY TAGS PANEL
// ─────────────────────────────────────────────
function toggleQualityTagsPanel() {
  const panel = document.getElementById('qualityTagsPanel');
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
}

function switchQTagTab(tab, btn) {
  // Update tab buttons
  document.querySelectorAll('.qtag-ptab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Update panes
  document.querySelectorAll('.qtag-pane').forEach(p => p.classList.remove('active-qtag-pane'));
  const pane = document.getElementById('qtag-pane-' + tab);
  if (pane) {
    pane.classList.add('active-qtag-pane');
    pane.style.display = 'block';
  }
  // Hide all other panes
  document.querySelectorAll('.qtag-pane').forEach(p => {
    if (!p.classList.contains('active-qtag-pane')) p.style.display = 'none';
  });
}

// ─────────────────────────────────────────────
// BASE IMAGE UPLOAD — single trigger fix
// ─────────────────────────────────────────────
function setupBaseImgZone() {
  const label = document.getElementById('baseImgLabel');
  const input = document.getElementById('baseImgInput');
  const zone  = document.getElementById('baseImgZone');
  if (!label || !input) return;

  // Click on label triggers file picker (only once)
  label.addEventListener('click', (e) => {
    e.preventDefault();
    input.click();
  });

  // File selected
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset value AFTER reading to allow re-selecting same file
    handleBaseImgUploadFile(file);
    input.value = '';
  });

  // Drag-and-drop from outside
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    label.classList.add('drop-hover');
  });
  zone.addEventListener('dragleave', () => label.classList.remove('drop-hover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    label.classList.remove('drop-hover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleBaseImgUploadFile(file);
  });
}

async function handleBaseImgUploadFile(file) {
  const dataUrl = await readFileAsDataURL(file);
  const meta = await extractPNGMetadata(file);

  if (meta && Object.keys(meta).length > 0) {
    // Store file/dataUrl ONLY as pending — do NOT write to state.img2imgFile yet.
    // That only happens if the user clicks "img2img" or "img2img + metadata".
    state.pendingMetadata = meta;
    state._pendingImg2ImgFile    = file;
    state._pendingImg2ImgDataUrl = dataUrl;
    document.getElementById('metaPreviewImg').src = dataUrl;
    document.getElementById('metaModal').classList.add('open');
    document.getElementById('metaBackdrop').classList.add('open');
  } else {
    setImg2Img(file, dataUrl);
  }
}

// Legacy handler kept for compatibility
async function handleBaseImgUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  await handleBaseImgUploadFile(file);
}

// ─────────────────────────────────────────────
// DRAG OUTPUT IMAGE → BASE IMG ZONE
// ─────────────────────────────────────────────
function onOutputImgDragStart(e) {
  e.dataTransfer.setData('text/plain', 'output-img');
  e.dataTransfer.setData('application/x-comfystudio-imgdrag', 'true');
  e.dataTransfer.effectAllowed = 'copy';
}

// Drop on the whole image area (left-panel baseImgZone)
function onDropAreaDragOver(e) {
  // Handled by base img zone drag events
}
function onDropAreaDragLeave(e) {}
function onDropAreaDrop(e) {}

// Allow dropping output image onto the base img label
function setupOutputImgDrop() {
  const label = document.getElementById('baseImgLabel');
  if (!label) return;
  const origOver = label.ondragover;
  label.addEventListener('dragover', (e) => {
    e.preventDefault();
    label.classList.add('drop-hover');
  });
  label.addEventListener('dragleave', () => label.classList.remove('drop-hover'));
  label.addEventListener('drop', async (e) => {
    e.preventDefault();
    label.classList.remove('drop-hover');
    // Check if it's the output image drag
    if (e.dataTransfer.getData('application/x-comfystudio-imgdrag') === 'true') {
      // Use the current displayed image
      if (state.currentImageUrl) {
        try {
          const resp = await fetch(state.currentImageUrl);
          const blob = await resp.blob();
          const file = new File([blob], 'output.png', { type: 'image/png' });
          const dataUrl = state.currentImageUrl.startsWith('blob:') ? state.currentImageUrl : await readFileAsDataURL(file);
          setImg2Img(file, dataUrl);
        } catch(err) {
          console.warn('Drag to base failed:', err);
        }
      }
      return;
    }
    // External file drop
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleBaseImgUploadFile(file);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(setupOutputImgDrop, 200);
});

// ─────────────────────────────────────────────
// META MODAL
// ─────────────────────────────────────────────
function closeMetaModal() {
  document.getElementById('metaModal').classList.remove('open');
  document.getElementById('metaBackdrop').classList.remove('open');
  state.pendingMetadata = null;
  state._pendingImg2ImgFile    = null;
  state._pendingImg2ImgDataUrl = null;
}

function importMetadata() {
  const meta = state.pendingMetadata;
  if (!meta) { closeMetaModal(); return; }

  if (document.getElementById('metaChkPositive').checked && meta.positivePrompt)
    document.getElementById('positivePrompt').value = meta.positivePrompt;
  if (document.getElementById('metaChkNegative').checked && meta.negativePrompt)
    document.getElementById('negativePrompt').value = meta.negativePrompt;
  if (document.getElementById('metaChkSeed').checked && meta.seed != null)
    document.getElementById('seedInput').value = meta.seed;
  if (document.getElementById('metaChkResolution')?.checked && (meta.imageW || meta.resW)) {
    const w = meta.imageW || meta.resW;
    const h = meta.imageH || meta.resH;
    // Switch UI to custom mode so the values actually stick
    const catSel = document.getElementById('resCategorySelect');
    if (catSel) catSel.value = 'custom';
    const customWEl = document.getElementById('customW');
    const customHEl = document.getElementById('customH');
    if (customWEl) customWEl.value = w;
    if (customHEl) customHEl.value = h;
    // Show/hide the correct panels
    const orientWrap = document.getElementById('resOrientWrap');
    const standardWrap = document.getElementById('resStandardWrap');
    const customWrap = document.getElementById('customResWrap');
    if (orientWrap)  orientWrap.style.display  = 'none';
    if (standardWrap) standardWrap.style.display = 'none';
    if (customWrap)  customWrap.classList.add('open');
    state.resCategory = 'custom';
    state.resW = w;
    state.resH = h;
    updateResDisplay();
  }
  if (document.getElementById('metaChkSampler').checked) {
    if (meta.sampler)   document.getElementById('samplerName').value = meta.sampler;
    if (meta.scheduler) document.getElementById('scheduler').value   = meta.scheduler;
    if (meta.steps)     { document.getElementById('stepsNum').value = meta.steps; syncNum('steps'); }
    if (meta.cfg)       { document.getElementById('cfgNum').value   = meta.cfg;   syncNum('cfg'); }
    if (meta.denoise)   { document.getElementById('denoiseNum').value = meta.denoise; syncNum('denoise'); }
  }
  if (document.getElementById('metaChkLoras').checked && meta.loras?.length) {
    document.getElementById('loraList').innerHTML = '';
    state.loras = [];
    const skipped = [];
    meta.loras.forEach(l => {
      // Only load the lora if it's available in the current model list
      const available = state.availableLoras || [];
      const match = available.find(name =>
        name === l.name ||
        name.toLowerCase() === l.name?.toLowerCase() ||
        name.replace(/\\/g, '/').split('/').pop() === l.name?.replace(/\\/g, '/').split('/').pop()
      );
      if (!match && available.length > 0) {
        skipped.push(l.name);
        return; // skip — lora not found
      }
      const loraName = match || l.name; // use exact match name if found
      addLora();
      const items = document.querySelectorAll('.lora-item');
      const last = items[items.length - 1];
      if (last) {
        const hiddenSel = last.querySelector('.lora-sel');
        const searchInput = last.querySelector('.lora-search-input');
        const num = last.querySelector('.lora-num');
        const slider = last.querySelector('.lora-slider');
        if (hiddenSel) hiddenSel.value = loraName;
        if (searchInput) searchInput.value = loraName;
        if (num) { num.value = l.strength; loraNumInput(num); }
        if (slider) slider.value = l.strength;
      }
    });
    if (skipped.length > 0) {
      showToast('info', 'LoRAs not loaded', `${skipped.length} LoRA(s) not found and were skipped: ${skipped.join(', ')}`, 6000);
    }
  }
  if (document.getElementById('metaChkChars').checked && meta.characters?.length) {
    document.getElementById('characterList').innerHTML = '';
    state.characters = [];
    state.charCounter = 0;
    meta.characters.forEach(ch => {
      addCharacter();
      const items = document.querySelectorAll('.char-item');
      const last = items[items.length - 1];
      if (last) {
        last.querySelector('.char-keyword-input').value = ch.keyword || `{char:${state.charCounter}}`;
        last.querySelector('.char-ta').value = ch.prompt || '';
        const c = state.characters[state.characters.length - 1];
        if (c) { c.keyword = ch.keyword; c.prompt = ch.prompt; }
      }
    });
  }
  closeMetaModal();
  updatePromptHighlight('positive');
  updatePromptHighlight('negative');
}

function useImg2Img() {
  if (state._pendingImg2ImgFile) setImg2Img(state._pendingImg2ImgFile, state._pendingImg2ImgDataUrl);
  closeMetaModal();
}

// Import metadata AND send to img2img in one click
function importAndUseImg2Img() {
  // Set img2img from pending state first, then import metadata (which closes modal)
  if (state._pendingImg2ImgFile) setImg2Img(state._pendingImg2ImgFile, state._pendingImg2ImgDataUrl);
  importMetadata(); // applies checked meta fields and closes modal
}

function setImg2Img(file, dataUrl) {
  state.img2imgFile    = file;
  state.img2imgDataUrl = dataUrl;
  document.getElementById('img2imgPreview').src = dataUrl;
  document.getElementById('img2imgStrip').style.display = 'block';
  updateInpaintBtnVisibility();
  // Override generation resolution to match the uploaded image
  const probe = new Image();
  probe.onload = () => {
    if (probe.naturalWidth && probe.naturalHeight) {
      state.resW = probe.naturalWidth;
      state.resH = probe.naturalHeight;
      updateResDisplay();
    }
  };
  probe.src = dataUrl;
}

function removeImg2Img() {
  // Clear all inpaint state so it doesn't bleed into future generations
  state.inpaintMaskBlob     = null;
  state.inpaintOrigDataUrl  = null;
  state.inpaintOrigFile     = null;
  // Clear the mask canvas too
  const maskCanvas = document.getElementById('inpaintMaskCanvas');
  if (maskCanvas) {
    const ctx = maskCanvas.getContext('2d');
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }
  state.img2imgFile    = null;
  state.img2imgDataUrl = null;
  document.getElementById('img2imgStrip').style.display = 'none';
  document.getElementById('img2imgPreview').src = '';
  const controls = document.getElementById('inpaintControls');
  if (controls) controls.style.display = 'none';
  updateInpaintBtnVisibility();
}

function updateImg2ImgDenoiseLabel(slider) {
  document.getElementById('img2imgDenoiseVal').textContent = parseFloat(slider.value).toFixed(2);
}

// ─────────────────────────────────────────────
// PNG METADATA
// ─────────────────────────────────────────────
async function extractPNGMetadata(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return {};
  const meta = {};
  let i = 8;
  while (i < bytes.length - 12) {
    const len = (bytes[i]<<24)|(bytes[i+1]<<16)|(bytes[i+2]<<8)|bytes[i+3];
    const type = String.fromCharCode(bytes[i+4],bytes[i+5],bytes[i+6],bytes[i+7]);
    if (type === 'tEXt') {
      const data = bytes.slice(i+8, i+8+len);
      const nullIdx = data.indexOf(0);
      if (nullIdx > -1) {
        const key = new TextDecoder().decode(data.slice(0, nullIdx));
        const val = new TextDecoder().decode(data.slice(nullIdx+1));
        if (key === 'ComfyStudioMeta') {
          try { Object.assign(meta, JSON.parse(val)); } catch(e) {}
        }
      }
    }
    if (type === 'IEND') break;
    i += 12 + len;
  }
  return meta;
}

async function embedPNGMetadata(sourceBlob, metaObj) {
  const jsonStr = JSON.stringify(metaObj);
  const key = 'ComfyStudioMeta';
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key);
  const valBytes = encoder.encode(jsonStr);
  const chunkData = new Uint8Array(keyBytes.length + 1 + valBytes.length);
  chunkData.set(keyBytes);
  chunkData[keyBytes.length] = 0;
  chunkData.set(valBytes, keyBytes.length + 1);
  const len = chunkData.length;
  const chunk = new Uint8Array(12 + len);
  chunk[0]=(len>>24)&0xff; chunk[1]=(len>>16)&0xff; chunk[2]=(len>>8)&0xff; chunk[3]=len&0xff;
  chunk[4]=0x74; chunk[5]=0x45; chunk[6]=0x58; chunk[7]=0x74;
  chunk.set(chunkData, 8);
  const crcData = new Uint8Array(4 + chunkData.length);
  crcData[0]=0x74; crcData[1]=0x45; crcData[2]=0x58; crcData[3]=0x74;
  crcData.set(chunkData, 4);
  const crc = crc32(crcData);
  chunk[8+len]=(crc>>24)&0xff; chunk[9+len]=(crc>>16)&0xff; chunk[10+len]=(crc>>8)&0xff; chunk[11+len]=crc&0xff;
  const origBuf = await sourceBlob.arrayBuffer();
  const orig = new Uint8Array(origBuf);
  // Dynamically find the end of IHDR rather than assuming byte 33.
  let SPLICE_AT = 8;
  if (orig.length > 33) {
    const ihdrLen = (orig[8]<<24)|(orig[9]<<16)|(orig[10]<<8)|orig[11];
    SPLICE_AT = 8 + 4 + 4 + ihdrLen + 4; // sig + len + type + data + CRC
  }
  const result = new Uint8Array(orig.length + chunk.length);
  result.set(orig.slice(0, SPLICE_AT));
  result.set(chunk, SPLICE_AT);
  result.set(orig.slice(SPLICE_AT), SPLICE_AT + chunk.length);
  return new Blob([result], {type: 'image/png'});
}

function crc32(bytes) {
  let c = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n=0; n<256; n++) {
      let v = n;
      for (let k=0; k<8; k++) v = (v&1) ? (0xedb88320^(v>>>1)) : (v>>>1);
      t[n] = v;
    }
    return t;
  })());
  for (let i=0; i<bytes.length; i++) c = table[(c^bytes[i])&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}

// ─────────────────────────────────────────────
// HISTORY PANEL
// ─────────────────────────────────────────────
function toggleHistoryPanel() {
  state.historyPanelOpen = !state.historyPanelOpen;
  document.getElementById('rightPanel').classList.toggle('collapsed', !state.historyPanelOpen);
}

// Bug fix: history help tooltip on hover, not click

// Insert a pending (loading spinner) placeholder into the history panel immediately
// when generation starts. batchSize placeholders are added for batch jobs.
// Remove any pending history placeholders (called on error or interrupt)
function removePendingHistoryItems() {
  const list = document.getElementById('historyList');
  list.querySelectorAll('.history-pending').forEach(el => el.remove());
  // If list is now empty, restore the empty hint
  if (!list.querySelector('.history-item') && !list.querySelector('.history-empty')) {
    list.innerHTML = '<p class="empty-hint history-empty">Generated images will appear here. Images in history will not be saved after closing the tab.</p>';
  }
}

function addPendingHistoryItem(batchSize = 1) {
  const list = document.getElementById('historyList');
  const empty = list.querySelector('.history-empty');
  if (empty) empty.remove();

  const tpl = document.getElementById('historyPendingTemplate');
  for (let i = 0; i < batchSize; i++) {
    const clone = tpl.content.cloneNode(true);
    const item = clone.querySelector('.history-pending');
    // Tag with a generation ID so we can find it when replacing
    item.dataset.pendingGen = state._pendingGenId || 'current';
    list.insertBefore(clone, list.firstChild);
  }
}

function addToHistory(imageUrl, metaObj) {
  state.historyCounter++;
  const id = state.historyCounter;

  // Try to replace the topmost pending placeholder for this generation
  const list = document.getElementById('historyList');
  const pending = list.querySelector('.history-pending');

  const tpl = document.getElementById('historyItemTemplate');
  const clone = tpl.content.cloneNode(true);
  const item = clone.querySelector('.history-item');
  item.dataset.histid = id;

  const thumb = clone.querySelector('.history-thumb');
  thumb.src = imageUrl;
  thumb.addEventListener('click', () => loadHistoryImage(id));

  const delBtn = clone.querySelector('.history-delete');
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    showConfirm('Delete this history image?', () => deleteHistoryItem(id));
  });

  if (pending) {
    // Replace the pending placeholder with the real image
    list.replaceChild(clone, pending);
  } else {
    // No placeholder found — fall back to inserting at top
    const emptyEl = list.querySelector('.history-empty');
    if (emptyEl) emptyEl.remove();
    list.insertBefore(clone, list.firstChild);
  }

  state.history.push({ id, url: imageUrl, meta: metaObj });
}

function loadHistoryImage(id) {
  const entry = state.history.find(h => h.id === id);
  if (!entry) return;
  const img = document.getElementById('outputImg');
  img.src = entry.url;
  img.style.display = 'block';
  document.getElementById('imgPlaceholder').style.display = 'none';
  document.getElementById('saveBtn').disabled = false;
  state.currentImageUrl = entry.url;
  state.currentImageFilename = `ComfyStudio_${id}.png`;
  state.lastGenMeta = entry.meta;
  updateImageInfoBar(entry.meta);
}

function deleteHistoryItem(id) {
  state.history = state.history.filter(h => h.id !== id);
  const el = document.querySelector(`.history-item[data-histid="${id}"]`);
  if (el) el.remove();
  if (document.querySelectorAll('.history-item').length === 0) {
    document.getElementById('historyList').innerHTML = '<p class="empty-hint history-empty">Generated images will appear here. Images in history will not be saved after closing the tab.</p>';
  }
}

function clearHistory() {
  showConfirm('Clear all history? This cannot be undone.', () => {
    state.history = [];
    document.getElementById('historyList').innerHTML = '<p class="empty-hint history-empty">Generated images will appear here. Images in history will not be saved after closing the tab</p>';
  });
}

async function downloadHistoryZip() {
  if (state.history.length === 0) { alert('No history to download.'); return; }
  for (let i = 0; i < state.history.length; i++) {
    const entry = state.history[i];
    await sleep(120);
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = `ComfyStudio_history_${String(i+1).padStart(3,'0')}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

// ─────────────────────────────────────────────
// CONFIRM DIALOG (replaces browser confirm())
// ─────────────────────────────────────────────
function showConfirm(message, onOk) {
  const modal = document.getElementById('confirmModal');
  const backdrop = document.getElementById('confirmBackdrop');
  document.getElementById('confirmText').textContent = message;
  modal.classList.add('open');
  backdrop.classList.add('open');
  const okBtn = document.getElementById('confirmOkBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');
  const cleanup = () => {
    modal.classList.remove('open');
    backdrop.classList.remove('open');
    okBtn.removeEventListener('click', handleOk);
    cancelBtn.removeEventListener('click', handleCancel);
    backdrop.removeEventListener('click', handleCancel);
  };
  const handleOk = () => { cleanup(); onOk(); };
  const handleCancel = () => { cleanup(); };
  okBtn.addEventListener('click', handleOk);
  cancelBtn.addEventListener('click', handleCancel);
  backdrop.addEventListener('click', handleCancel);
}
function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('open');
  document.getElementById('confirmBackdrop').classList.remove('open');
}

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────
function openSettings() {
  document.getElementById('settingsModal').classList.add('open');
  document.getElementById('settingsBackdrop').classList.add('open');
  syncThemeColorPickers();
}
function closeSettings() {
  document.getElementById('settingsModal').classList.remove('open');
  document.getElementById('settingsBackdrop').classList.remove('open');
}
function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.stab-pane').forEach(p => p.classList.remove('active-stab'));
  document.getElementById('stab-' + tab).classList.add('active-stab');
}

function onRescaleCFGToggle() {
  state.rescaleCFGEnabled = document.getElementById('rescaleCFGToggle').checked;
  document.getElementById('rescaleCFGSliderWrap').style.display = state.rescaleCFGEnabled ? 'flex' : 'none';
}

function resetThemeToDefault() {
  _customThemeOverrides = {};
  // Re-apply the current preset theme cleanly
  applyTheme(state.currentTheme || 'novelai-dark', null, false);
  // Clear font inputs
  const fontDisp = document.getElementById('tc-font-disp');
  const fontUi = document.getElementById('tc-font-ui');
  if (fontDisp) fontDisp.value = '';
  if (fontUi) fontUi.value = '';
  syncThemeColorPickers();
  localStorage.removeItem('customThemeConfig');
}
// ─────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────

// Stored custom theme overrides applied when customThemeEnabled is true
let _customThemeOverrides = {};
state.customThemeEnabled = false;

function toggleCustomTheme(enabled) {
  state.customThemeEnabled = enabled;
  const controls = document.getElementById('customThemeControls');
  if (controls) controls.style.display = enabled ? 'block' : 'none';

  if (enabled) {
    // Re-apply stored overrides on top of current theme
    Object.entries(_customThemeOverrides).forEach(([k, v]) => {
      document.documentElement.style.setProperty(k, v);
    });
    syncThemeColorPickers();
  } else {
    // Revert to dark theme (clear all inline CSS var overrides)
    applyTheme('novelai-dark', null, true);
    // Mark dark theme button active
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === 'novelai-dark');
    });
    // Re-sync pickers to the reverted theme
    syncThemeColorPickers();
  }
  localStorage.setItem('comfyStudioCustomThemeEnabled', enabled);
}

function applyTheme(themeName, btn, silent) {
  // Clear any inline CSS var overrides first (so the [data-theme] attribute takes full effect)
  const varsToClear = ['--bg-void','--bg-panel','--bg-card','--bg-input','--bg-elevated',
    '--bg-overlay','--border-faint','--border-mid','--border-accent','--accent','--accent-glow',
    '--accent-bright','--accent-dim','--positive','--positive-glow','--negative','--negative-glow',
    '--text-hi','--text-mid','--text-lo','--modifier-low','--modifier-high','--gen-btn-from','--gen-btn-to',
    '--font-disp','--font-ui'];
  varsToClear.forEach(v => document.documentElement.style.removeProperty(v));

  document.documentElement.setAttribute('data-theme', themeName);
  state.currentTheme = themeName;
  localStorage.setItem('comfyStudioTheme', themeName);

  // If custom theme is enabled, re-apply overrides on top
  if (state.customThemeEnabled) {
    Object.entries(_customThemeOverrides).forEach(([k, v]) => {
      document.documentElement.style.setProperty(k, v);
    });
  }

  if (!silent) {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
      const match = document.querySelector(`.theme-btn[data-theme="${themeName}"]`);
      if (match) match.classList.add('active');
    }
    syncThemeColorPickers();
  }
}

function syncThemeColorPickers() {
  const s = getComputedStyle(document.documentElement);
  const get = (v) => s.getPropertyValue(v).trim();
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v) { try { el.value = toHex(v); } catch(e) {} }
  };
  set('tc-bg-void', get('--bg-void'));
  set('tc-bg-panel', get('--bg-panel'));
  set('tc-bg-card', get('--bg-card'));
  set('tc-bg-input', get('--bg-input'));
  set('tc-bg-elevated', get('--bg-elevated'));
  set('tc-bg-overlay', get('--bg-overlay'));
  set('tc-border-faint', get('--border-faint'));
  set('tc-border-mid', get('--border-mid'));
  set('tc-border-accent', get('--border-accent'));
  set('tc-accent', get('--accent'));
  set('tc-accent-bright', get('--accent-bright'));
  set('tc-accent-dim', get('--accent-dim'));
  set('tc-positive', get('--positive'));
  set('tc-negative', get('--negative'));
  set('tc-text-hi', get('--text-hi'));
  set('tc-text-mid', get('--text-mid'));
  set('tc-text-lo', get('--text-lo'));
  set('tc-gen-btn', get('--gen-btn-from'));
  set('tc-gen-btn-to', get('--gen-btn-to'));
  set('tc-modifier-low', get('--modifier-low'));
  set('tc-modifier-high', get('--modifier-high'));
}

function toHex(color) {
  // Convert rgb/rgba/hex to #rrggbb
  if (color.startsWith('#')) {
    if (color.length === 4) return '#' + color[1]+color[1]+color[2]+color[2]+color[3]+color[3];
    return color.slice(0,7);
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  return '#888888';
}

function applyCustomThemeVar(varName, value) {
  _customThemeOverrides[varName] = value;
  document.documentElement.style.setProperty(varName, value);
}

function applyCustomThemeVarRgba(varName, hexColor, alpha) {
  // Convert hex to rgba
  const r = parseInt(hexColor.slice(1,3),16);
  const g = parseInt(hexColor.slice(3,5),16);
  const b = parseInt(hexColor.slice(5,7),16);
  const val = `rgba(${r},${g},${b},${alpha})`;
  _customThemeOverrides[varName] = val;
  document.documentElement.style.setProperty(varName, val);
}

function applyCustomFontVar(varName, fontName, fallback) {
  if (!fontName.trim()) {
    delete _customThemeOverrides[varName];
    document.documentElement.style.removeProperty(varName);
  } else {
    const val = `'${fontName}', ${fallback}`;
    _customThemeOverrides[varName] = val;
    document.documentElement.style.setProperty(varName, val);
  }
}

function exportTheme() {
  const s = getComputedStyle(document.documentElement);
  const vars = ['--bg-void','--bg-panel','--bg-card','--bg-input','--bg-elevated',
    '--accent','--accent-bright','--accent-dim','--positive','--negative',
    '--text-hi','--text-mid','--text-lo','--font-disp','--font-ui','--font-mono',
    '--gen-btn-from','--gen-btn-to','--modifier-low','--modifier-high'];
  const data = {};
  vars.forEach(v => { data[v] = s.getPropertyValue(v).trim(); });
  data['_name'] = state.currentTheme + '_custom';
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'comfystudio_theme.json';
  a.click();
}

function importTheme(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
      });
      syncThemeColorPickers();
    } catch(err) { alert('Invalid theme file.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ─────────────────────────────────────────────
// AUTOCOMPLETE — auto-detect CSV files
// ─────────────────────────────────────────────
async function scanAutoCompleteFolder() {
  const select = document.getElementById('autocompleteSource');
  const status = document.getElementById('autocompleteStatus');
  try {
    const resp = await fetch('/list-autocomplete');
    if (!resp.ok) throw new Error('endpoint unavailable');
    const data = await resp.json();
    const files = data.files || [];
    if (files.length > 0) {
      while (select.options.length > 1) select.remove(1);
      files.forEach(name => {
        const opt = document.createElement('option');
        opt.value = '/autocomplete-csv/' + encodeURIComponent(name);
        opt.textContent = name;
        select.appendChild(opt);
      });
      status.textContent = `✓ Found ${files.length} CSV file(s) in autocomplete folder.`;
    } else {
      status.textContent = 'No CSV files found in "comfystudio autocomplete" folder.';
    }
  } catch(e) {
    status.textContent = 'Auto-detect unavailable — use drag-and-drop below.';
  }
}

function setupCSVDrop() {
  const zone = document.getElementById('csvDropZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadCSVFile(file);
  });
  zone.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv';
    inp.addEventListener('change', e => { if (e.target.files[0]) loadCSVFile(e.target.files[0]); });
    inp.click();
  });
}

async function loadCSVFile(file) {
  const text = await file.text();
  parseCSVText(text, file.name);
}

function parseCSVText(text, name) {
  const lines = text.split('\n');
  state.autocompleteData = lines
    .map(l => l.split(',')[0].trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  document.getElementById('autocompleteStatus').textContent =
    `✓ Loaded ${state.autocompleteData.length} tags from "${name}"`;
  setupPromptAutocomplete();
}

async function loadAutocompleteSource(skipSave) {
  const val = document.getElementById('autocompleteSource').value;
  if (!skipSave) saveAcSettings(); // persist the chosen source
  if (val === 'none') {
    state.autocompleteData = [];
    removeAutocompleteHandlers();
    document.getElementById('autocompleteStatus').textContent = 'Autocomplete disabled.';
    return;
  }
  // Fetch the CSV file from the server
  try {
    const resp = await fetch(val);
    if (!resp.ok) throw new Error('Fetch failed');
    const text = await resp.text();
    const name = val.split('/').pop();
    parseCSVText(text, name);
  } catch(e) {
    document.getElementById('autocompleteStatus').textContent = `Could not load "${val}". Use drag-and-drop instead.`;
  }
}

let _acHandlers = [];
function removeAutocompleteHandlers() {
  _acHandlers.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
  _acHandlers = [];
  _charAcHandlers.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
  _charAcHandlers = [];
  document.querySelectorAll('.autocomplete-list').forEach(el => el.remove());
}

function saveAcSettings() {
  const sourceEl = document.getElementById('autocompleteSource');
  localStorage.setItem('comfyStudioAcSettings', JSON.stringify({
    escapeParens: state.acEscapeParens,
    replaceUnderscores: state.acReplaceUnderscores,
    source: sourceEl ? sourceEl.value : 'none',
  }));
}

function setupPromptAutocomplete() {
  removeAutocompleteHandlers();
  const textareas = [
    document.getElementById('positivePrompt'),
    document.getElementById('negativePrompt'),
    document.getElementById('enhancePrompt'),
    document.getElementById('enhanceNegativePrompt'),
  ];
  textareas.forEach(ta => {
    if (!ta) return;
    let dropdown = null;
    const onInput = () => {
      if (!state.autocompleteData.length) return;
      const cur = getTagAtCursor(ta);
      if (!cur || cur.length < 2) { hideAC(); return; }
      const matches = state.autocompleteData.filter(t =>
        t.toLowerCase().startsWith(cur.toLowerCase())
      ).slice(0, 8);
      if (!matches.length) { hideAC(); return; }
      showAC(ta, matches, cur);
    };
    const onKeydown = e => {
      if (!dropdown) return;
      const items = dropdown.querySelectorAll('.autocomplete-item');
      const active = dropdown.querySelector('.autocomplete-item.active');
      let idx = [...items].indexOf(active);
      if (e.key === 'ArrowDown')  { e.preventDefault(); setACActive(items, Math.min(idx+1, items.length-1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setACActive(items, Math.max(idx-1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        const a = dropdown.querySelector('.autocomplete-item.active');
        if (a) { e.preventDefault(); acceptTag(ta, a.textContent); hideAC(); }
      } else if (e.key === 'Escape') hideAC();
    };
    const onBlur = () => setTimeout(hideAC, 150);

    function showAC(anchor, matches, cur) {
      hideAC();
      dropdown = document.createElement('div');
      dropdown.className = 'autocomplete-list';
      matches.forEach((m, i) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item' + (i===0?' active':'');
        item.textContent = m;
        item.addEventListener('mousedown', e => { e.preventDefault(); acceptTag(anchor, m); hideAC(); });
        dropdown.appendChild(item);
      });
      const rect = anchor.getBoundingClientRect();
      dropdown.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom+2}px;width:${rect.width}px`;
      document.body.appendChild(dropdown);
    }
    function hideAC() {
      if (dropdown) { dropdown.remove(); dropdown = null; }
    }
    function setACActive(items, idx) {
      items.forEach((it,i) => it.classList.toggle('active', i===idx));
    }
    function acceptTag(textarea, tag) {
      const cur = getTagAtCursor(textarea);
      if (!cur) return;
      let finalTag = tag;
      if (state.acReplaceUnderscores) finalTag = finalTag.replace(/_/g, ' ');
      if (state.acEscapeParens) finalTag = finalTag.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      const start = textarea.selectionStart - cur.length;
      const end   = textarea.selectionStart;
      textarea.value = textarea.value.slice(0, start) + finalTag + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + finalTag.length;
    }

    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', onKeydown);
    ta.addEventListener('blur', onBlur);
    _acHandlers.push([ta,'input',onInput],[ta,'keydown',onKeydown],[ta,'blur',onBlur]);
  });

  // Also (re-)attach autocomplete to all existing character textareas
  document.querySelectorAll('.char-ta').forEach(cta => setupCharAutocomplete(cta));
}

function getTagAtCursor(textarea) {
  const val = textarea.value.slice(0, textarea.selectionStart);
  const m = val.match(/[^,\s()\[\]{}]+$/);
  return m ? m[0] : '';
}

// ─────────────────────────────────────────────
// BUILD WORKFLOW
// ─────────────────────────────────────────────
async function buildWorkflow(img2imgNodeId) {
  const positive    = buildPositivePrompt();
  const negative    = buildNegativePrompt();
  const samplerName = document.getElementById('samplerName').value;
  const scheduler   = document.getElementById('scheduler').value;
  const steps       = parseInt(document.getElementById('stepsNum').value);
  const cfg         = parseFloat(document.getElementById('cfgNum').value);
  const batchSize   = parseInt(document.getElementById('batchNum').value);
  const width       = state.resW;
  const height      = state.resH;
  const vaeRaw      = document.getElementById('vaeSelect').value;
  const te          = document.getElementById('teSelect')?.value ?? 'none';
  const teType      = document.getElementById('teType')?.value ?? 'stable_diffusion';

  let denoise;
  if (state.img2imgDataUrl && img2imgNodeId) {
    denoise = parseFloat(document.getElementById('img2imgDenoise').value);
  } else {
    denoise = parseFloat(document.getElementById('denoiseNum').value);
  }

  let seed = parseInt(document.getElementById('seedInput').value);
  if (seed === -1 || !state.seedLocked) {
    seed = Math.floor(Math.random() * 2 ** 32);
    if (!state.seedLocked) document.getElementById('seedInput').value = seed;
  }

  const nodes = {};
  let nid = 1;
  const id = () => String(nid++);
  let modelSrc, clipSrc, vaeSrc;

  if (state.modelType === 'checkpoint') {
    const ckptId = id();
    nodes[ckptId] = {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: document.getElementById('checkpointSelect').value }
    };
    modelSrc = [ckptId, 0]; clipSrc = [ckptId, 1]; vaeSrc = [ckptId, 2];
  } else {
    const unetId = id();
    nodes[unetId] = {
      class_type: 'UNETLoader',
      inputs: { unet_name: document.getElementById('diffusionSelect').value, weight_dtype: 'default' }
    };
    modelSrc = [unetId, 0]; vaeSrc = null;
    const clipId = id();
    nodes[clipId] = {
      class_type: 'CLIPLoader',
      inputs: { clip_name: te !== 'none' ? te : '', type: teType }
    };
    clipSrc = [clipId, 0];
  }

  if (vaeRaw && !vaeRaw.startsWith('Automatic')) {
    const vaeId = id();
    nodes[vaeId] = { class_type: 'VAELoader', inputs: { vae_name: vaeRaw } };
    vaeSrc = [vaeId, 0];
  } else if (vaeSrc === null) {
    const vaeOpt = document.getElementById('vaeSelect');
    const fallbackVae = vaeOpt.options[vaeOpt.selectedIndex]?.value;
    if (fallbackVae && !fallbackVae.startsWith('Automatic')) {
      const vaeId = id();
      nodes[vaeId] = { class_type: 'VAELoader', inputs: { vae_name: fallbackVae } };
      vaeSrc = [vaeId, 0];
    }
  }

  // V-Prediction
  if (state.vPrediction) {
    const vpId = id();
    nodes[vpId] = { class_type: 'ModelSamplingDiscrete', inputs: { model: modelSrc, sampling: 'v_prediction', zsnr: true } };
    modelSrc = [vpId, 0];
  }

  // RescaleCFG
  if (state.rescaleCFGEnabled) {
    const rcfgId = id();
    nodes[rcfgId] = {
      class_type: 'RescaleCFG',
      inputs: { model: modelSrc, multiplier: parseFloat(document.getElementById('rescaleCFGNum').value) }
    };
    modelSrc = [rcfgId, 0];
  }

  getActiveLoRAs().forEach(lora => {
    const loraId = id();
    nodes[loraId] = {
      class_type: 'LoraLoader',
      inputs: { model: modelSrc, clip: clipSrc, lora_name: lora.name, strength_model: lora.strength, strength_clip: lora.strength }
    };
    modelSrc = [loraId, 0]; clipSrc = [loraId, 1];
  });

  const posId = id();
  nodes[posId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: positive } };
  const negId = id();
  nodes[negId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: negative } };

  let posSrc = [posId, 0];
  let negSrc  = [negId, 0];

  // ── Regional Prompting — capture global prompts early ─────────
  // Pass 1 (global KSampler) runs with the RP global prompt.
  // Pass 2 (regional inpaint) appends after Pass 1 using painted masks.
  let rpGlobalPos = positive, rpGlobalNeg = negative;
  let rpEnabled = rpState.enabled && rpState.regions.some(r => r.enabled && r.prompt.trim());
  if (rpEnabled) {
    const rawGlobalPos = document.getElementById('rpGlobalPrompt')?.value ?? '';
    const rawGlobalNeg = document.getElementById('rpGlobalNegPrompt')?.value ?? '';
    rpGlobalPos = rpState.prependQualityTags && state.qualityTagsEnabled && state.qualityTagsText.trim()
      ? state.qualityTagsText.trim().replace(/,\s*$/, '') + (rawGlobalPos.trim() ? ', ' + rawGlobalPos : '')
      : rawGlobalPos;
    rpGlobalNeg = rpState.prependNegQualityTags && state.negQualityTagsEnabled && state.negQualityTagsText.trim()
      ? state.negQualityTagsText.trim().replace(/,\s*$/, '') + (rawGlobalNeg.trim() ? ', ' + rawGlobalNeg : '')
      : rawGlobalNeg;
    // Wire global RP prompt into the global KSampler pass
    nodes[posId].inputs.text = rpGlobalPos || positive;
    nodes[negId].inputs.text = rpGlobalNeg || negative;
  }

  // ── IP-Adapter ───────────────────────────────────────────────
  if (state.ipAdapterEnabled && state.ipaImageName) {
    const ipaModel   = document.getElementById('ipaModelSelect')?.value;
    const ipaClip    = document.getElementById('ipaClipSelect')?.value;
    const ipaWeight  = parseFloat(document.getElementById('ipaWeightNum')?.value ?? 1.0);
    const ipaWType   = document.getElementById('ipaWeightType')?.value ?? 'standard';

    if (ipaModel && ipaClip) {
      const ipaLoaderId = id();
      nodes[ipaLoaderId] = { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: ipaModel } };

      const clipVisId = id();
      nodes[clipVisId] = { class_type: 'CLIPVisionLoader', inputs: { clip_name: ipaClip } };

      const ipaImgId = id();
      nodes[ipaImgId] = { class_type: 'LoadImage', inputs: { image: state.ipaImageName, upload: 'image' } };

      const ipaEncId = id();
      nodes[ipaEncId] = { class_type: 'CLIPVisionEncode', inputs: { clip_vision: [clipVisId, 0], image: [ipaImgId, 0] } };

      const ipaApplyId = id();
      nodes[ipaApplyId] = {
        class_type: 'IPAdapter',
        inputs: {
          model:          modelSrc,
          ipadapter:      [ipaLoaderId, 0],
          image:          [ipaEncId, 0],
          weight:         ipaWeight,
          weight_type:    ipaWType,
          start_at:       0.0,
          end_at:         1.0,
          combine_embeds: 'concat',
        }
      };
      modelSrc = [ipaApplyId, 0];
    }
  }

  // ── ControlNet ───────────────────────────────────────────────
  if (state.controlNetEnabled && state.cnImageName) {
    const cnModel    = document.getElementById('cnModelSelect')?.value;
    const cnStrength = parseFloat(document.getElementById('cnStrengthNum')?.value ?? 1.0);
    const cnStart    = parseFloat(document.getElementById('cnStartNum')?.value   ?? 0.0);
    const cnEnd      = parseFloat(document.getElementById('cnEndNum')?.value     ?? 1.0);

    if (cnModel) {
      const cnLoadId = id();
      nodes[cnLoadId] = { class_type: 'ControlNetLoader', inputs: { control_net_name: cnModel } };

      const cnImgId = id();
      nodes[cnImgId] = { class_type: 'LoadImage', inputs: { image: state.cnImageName, upload: 'image' } };

      const cnApplyId = id();
      nodes[cnApplyId] = {
        class_type: 'ControlNetApplyAdvanced',
        inputs: {
          positive:    posSrc,
          negative:    negSrc,
          control_net: [cnLoadId, 0],
          image:       [cnImgId, 0],
          strength:    cnStrength,
          start_percent: cnStart,
          end_percent:   cnEnd,
          vae:         vaeSrc || ['1', 2],
        }
      };
      posSrc = [cnApplyId, 0];
      negSrc  = [cnApplyId, 1];
    }
  }

  let latentSrc;
  if (state.img2imgDataUrl && img2imgNodeId) {
    const loadId = id();
    nodes[loadId] = { class_type: 'LoadImage', inputs: { image: img2imgNodeId, upload: 'image' } };
    const encId = id();
    nodes[encId] = { class_type: 'VAEEncode', inputs: { pixels: [loadId, 0], vae: vaeSrc || ['1', 2] } };
    latentSrc = [encId, 0];
  } else {
    const latId = id();
    nodes[latId] = { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: batchSize } };
    latentSrc = [latId, 0];
  }

  // ── Pass 1: Global KSampler ────────────────────────────────────
  const ksId = id();
  nodes[ksId] = {
    class_type: 'KSampler',
    inputs: {
      model: modelSrc, positive: posSrc, negative: negSrc,
      latent_image: latentSrc,
      seed, steps, cfg, sampler_name: samplerName, scheduler, denoise,
    }
  };

  // ── Pass 2: Regional inpaint pass (appended after global) ─────
  let finalLatentSrc = [ksId, 0];
  if (rpEnabled) {
    try {
      const rpLatSrc = await buildRegionalInpaintPass(
        nodes, id, [ksId, 0],
        modelSrc, clipSrc, vaeSrc,
        rpGlobalPos, rpGlobalNeg,
        seed, steps, cfg, samplerName, scheduler
      );
      if (rpLatSrc) finalLatentSrc = rpLatSrc;
    } catch (e) {
      console.warn('[RP] Regional inpaint pass failed, using global output:', e);
    }
  }

  const decId = id();
  nodes[decId] = { class_type: 'VAEDecode', inputs: { samples: finalLatentSrc, vae: vaeSrc || ['1', 2] } };

  const saveId = id();
  nodes[saveId] = { class_type: 'SaveImage', inputs: { images: [decId, 0], filename_prefix: 'ComfyStudio' } };

  return nodes;
}

// ─────────────────────────────────────────────
// GENERATE
// ─────────────────────────────────────────────
async function generate() {
  // Route to inpaint workflow when a mask is active
  if (state.inpaintMaskBlob) { await generateInpaint(); return; }

  if (state.generating) return;

  // Marble cost check
  if (state.marblesEnabled) {
    const cost = MARBLE_COSTS[state.resCategory] || 5;
    if (state.marbles < cost) {
      alert(`Not enough marbles! Need ${cost}, have ${state.marbles}.`);
      return;
    }
  }

  state.generating = true;
  const btn = document.getElementById('generateBtn');
  btn.classList.add('loading');

  const batchSize = parseInt(document.getElementById('batchNum').value) || 1;
  state.batchTotal = batchSize;
  state.batchCurrent = 0;

  if (batchSize > 1) {
    document.getElementById('batchCounter').style.display = 'block';
    document.getElementById('batchCounterText').textContent = `Image 1/${batchSize}`;
  }

  document.getElementById('genBtnText').textContent = 'Generating…';
  showGenOverlay(true);
  clearProgress();

  // Insert a pending placeholder card into history immediately
  addPendingHistoryItem(batchSize);

  let img2imgNodeId = null;
  if (state.img2imgDataUrl) {
    try { img2imgNodeId = await uploadImg2ImgFile(); }
    catch(e) { console.warn('img2img upload failed:', e); }
  }

  const workflow = await buildWorkflow(img2imgNodeId);

  // Capture generation metadata now — seed was written to seedInput by buildWorkflow.
  const capturedSeed = parseInt(document.getElementById('seedInput').value);
  state.lastGenMeta = captureGenMeta(capturedSeed);

  // Pre-flight: warn immediately if Automatic (embedded) VAE is selected —
  // ComfyUI doesn't know what to do with this placeholder and will fail.
  const vaeCheck = document.getElementById('vaeSelect')?.value || '';
  if (vaeCheck.startsWith('Automatic')) {
    showGenOverlay(false);
    clearProgress();
    removePendingHistoryItems();
    resetBtn();
    showToast('error', 'No VAE Selected',
      'Please choose a real VAE from the VAE dropdown. "Automatic (embedded)" is not a valid VAE — ' +
      'select the VAE that matches your model (e.g. vae-ft-mse-840000.safetensors) before generating.',
      0);
    return;
  }

  try {
    const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: state.clientId })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    state.lastPromptId = data.prompt_id;
    // Push metadata to server so remote clients can fetch it via /meta/get.
    fetch('/meta/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_id: data.prompt_id, meta: state.lastGenMeta }),
    }).catch(() => {});
    // Remote clients: the WS executing/null handler is the single trigger for
    // pollForImages — calling it here too causes a double history entry.
    if (!_isLocalAccess()) return;
    await pollForImages(data.prompt_id, batchSize);
  } catch(e) {
    console.error(e);
    showGenOverlay(false);
    clearProgress();
    removePendingHistoryItems();
    resetBtn();
    // Detect VAE-related errors from ComfyUI and show a friendlier message.
    // The specific signature is: prompt_outputs_failed_validation with a VAEDecode
    // node error of "tuple index out of range" — this happens when no valid VAE
    // source is wired up, typically because "Automatic (embedded)" was selected.
    const errStr = (e.message || String(e)).toLowerCase();
    const isVaeError =
      (errStr.includes('vaedecode') || errStr.includes('class_type') && errStr.includes('vaedecode')) ||
      (errStr.includes('tuple index out of range') && errStr.includes('images')) ||
      (errStr.includes('prompt_outputs_failed_validation') && errStr.includes('vaedecode')) ||
      (errStr.includes('exception_during_inner_validation') && errStr.includes('vaedecode'));
    if (isVaeError) {
      showToast('error', 'VAE Error — Please Select a Valid VAE',
        'Generation failed because no valid VAE is connected. This is almost always caused by ' +
        '"Automatic (embedded)" being selected in the VAE dropdown — please pick the actual ' +
        '.safetensors VAE file that matches your model and try again.',
        0);
    } else {
      showToast('error', 'Generation Failed', e.message || String(e));
    }
  }
}

async function uploadImg2ImgFile() {
  const formData = new FormData();
  formData.append('image', state.img2imgFile, state.img2imgFile.name || 'img2img.png');
  const res = await comfyFetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  const json = await res.json();
  return json.name;
}

function captureGenMeta(seed) {
  return {
    positivePrompt: document.getElementById('positivePrompt').value,
    negativePrompt: document.getElementById('negativePrompt').value,
    seed: parseInt(seed),
    sampler:   document.getElementById('samplerName').value,
    scheduler: document.getElementById('scheduler').value,
    steps:     parseInt(document.getElementById('stepsNum').value),
    cfg:       parseFloat(document.getElementById('cfgNum').value),
    denoise:   parseFloat(document.getElementById('denoiseNum').value),
    model: state.modelType === 'checkpoint'
      ? document.getElementById('checkpointSelect').value
      : document.getElementById('diffusionSelect').value,
    loras: state.saveLorasMeta !== false ? getActiveLoRAs() : [],
    characters: state.characters.filter(c => c.enabled).map(c => ({
      keyword: c.keyword,
      prompt: document.querySelector(`.char-item[data-charid="${c.id}"]`)?.querySelector('.char-ta')?.value || c.prompt
    })),
    resW: state.resW, resH: state.resH,
    generatedAt: new Date().toISOString(),
  };
}

// Poll and handle multiple images in a batch — bug fix: add to history only once per image
async function pollForImages(promptId, batchSize) {
  const deadline = Date.now() + 600_000;
  let imagesDisplayed = 0;

  while (Date.now() < deadline) {
    await sleep(2000);
    try {
      const res = await comfyFetch(`${state.comfyUrl}/history/${promptId}`);
      const history = await res.json();
      const entry = history[promptId];
      if (entry?.status?.completed) {
        const allImages = [];
        for (const nodeId in entry.outputs) {
          const imgs = entry.outputs[nodeId]?.images;
          if (imgs?.length) imgs.forEach(img => allImages.push(img));
        }
        // Display each image exactly once
        for (let i = imagesDisplayed; i < allImages.length; i++) {
          state.batchCurrent = i + 1;
          if (batchSize > 1) {
            document.getElementById('batchCounterText').textContent = `Image ${i+1}/${batchSize}`;
          }
          await displayImage(allImages[i].filename, allImages[i].subfolder, allImages[i].type);
          imagesDisplayed++;
        }
        if (entry.status.completed && allImages.length >= batchSize) {
          // All done
          document.getElementById('batchCounter').style.display = 'none';
          playNotifSound();
          deductMarbles(MARBLE_COSTS[state.resCategory] || 5);
          return;
        }
      }
    } catch(e) { /* keep polling */ }
  }
  showGenOverlay(false);
  clearProgress();
  removePendingHistoryItems();
  resetBtn();
  showToast('info', 'Still Working…', 'ComfyUI is still running — the interface lost track of this generation after 10 minutes. Check ComfyUI directly or generate again.', 0);
}

async function displayImage(filename, subfolder, type) {
  const params = new URLSearchParams({ filename, subfolder, type });
  const url = comfyViewUrl(params);

  // ── Remote clients: safety-net metadata fetch ──────────────────────────
  // The WS executing handler fetches metadata before calling pollForImages.
  // This is a fallback in case it arrives here before that fetch resolves.
  if (!state.lastGenMeta && state.lastPromptId && !_isLocalAccess()) {
    try {
      const mRes = await fetch(`/meta/get?prompt_id=${encodeURIComponent(state.lastPromptId)}`);
      if (mRes.ok) {
        const mData = await mRes.json();
        if (mData.meta) state.lastGenMeta = mData.meta;
      }
    } catch(e) { /* server.js not reachable — continue without metadata */ }
  }

  let finalUrl = url;

  // ── Focused Inpainting: composite result crop back into original ──────────
  if (state._focusedInpaintParams) {
    state._wasInpaintResult = true;
    const { origUrl, cropRect, featherPx } = state._focusedInpaintParams;
    state._focusedInpaintParams = null; // clear before async ops to avoid double-fire

    try {
      const cropResp   = await fetch(url);
      const cropBlob   = await cropResp.blob();
      const cropBitmap = await createImageBitmap(cropBlob);

      const compositeBlob = await compositeInpaintResult(origUrl, cropBitmap, cropRect, featherPx);

      // Embed metadata and create final URL
      if (state.lastGenMeta && state.saveMetadataEnabled !== false) {
        try {
          // Capture actual composite pixel dimensions
          try {
            const bmp = await createImageBitmap(compositeBlob);
            state.lastGenMeta.imageW = bmp.width;
            state.lastGenMeta.imageH = bmp.height;
            bmp.close();
          } catch(e) {}
          const enriched = await embedPNGMetadata(compositeBlob, state.lastGenMeta);
          finalUrl = URL.createObjectURL(enriched);
        } catch (e) {
          finalUrl = URL.createObjectURL(compositeBlob);
        }
      } else {
        finalUrl = URL.createObjectURL(compositeBlob);
      }
    } catch (e) {
      console.warn('Focused inpaint composite failed, falling back to crop display:', e);
      finalUrl = url;
    }
  } else if (state.lastGenMeta && state.saveMetadataEnabled !== false) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      // Capture actual output pixel dimensions and store in metadata
      try {
        const bmp = await createImageBitmap(blob);
        state.lastGenMeta.imageW = bmp.width;
        state.lastGenMeta.imageH = bmp.height;
        bmp.close();
      } catch(e) {}
      const enrichedBlob = await embedPNGMetadata(blob, state.lastGenMeta);
      finalUrl = URL.createObjectURL(enrichedBlob);
    } catch(e) {
      console.warn('Metadata embed failed:', e);
      finalUrl = url;
    }
  }

  state.currentImageUrl = finalUrl;
  state.currentImageFilename = filename;

  const img = document.getElementById('outputImg');
  img.src = finalUrl;
  img.style.display = 'block';
  document.getElementById('imgPlaceholder').style.display = 'none';
  document.getElementById('saveBtn').disabled = false;
  showGenOverlay(false);
  clearProgress();
  resetBtn();

  updateImageInfoBar(state.lastGenMeta);

  // Add to history ONCE per image (bug fix: called once per image)
  addToHistory(finalUrl, state.lastGenMeta);

  // Auto-save if enabled — detect inpaint by whether composite params were set
  maybeAutoSave(!!state._wasInpaintResult);
  state._wasInpaintResult = false;
}

async function fetchLatestImage() {
  if (!state.lastPromptId) return;
  try {
    const res = await comfyFetch(`${state.comfyUrl}/history/${state.lastPromptId}`);
    const history = await res.json();
    const entry = history[state.lastPromptId];
    if (!entry) return;
    for (const nodeId in entry.outputs) {
      const imgs = entry.outputs[nodeId]?.images;
      if (imgs?.length) {
        // Only display if we haven't already via polling
        // (polling is the primary display path; fetchLatestImage is fallback)
        return;
      }
    }
  } catch(e) {}
}

async function interrupt() {
  try { await comfyFetch(`${state.comfyUrl}/interrupt`, { method: 'POST' }); } catch(e) {}
  resetBtn();
}

async function freeMemory() {
  const btn = document.getElementById('freeMemBtn');
  if (btn) { btn.disabled = true; btn.textContent = '🚀…'; }
  try {
    await comfyFetch(`${state.comfyUrl}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true })
    });
    showToast('success', 'Memory Freed', 'Models unloaded and VRAM cleared. Next generation will reload the model.', 4000);
  } catch(e) {
    showToast('error', 'Free Memory Failed', e.message || String(e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚀'; }
  }
}

// ─────────────────────────────────────────────
// OUTPUT PATHS & AUTO-SAVE
// ─────────────────────────────────────────────
function saveStepPreviewPref(_enabled) {
  // Step preview is always enabled — this function is kept for compatibility
  // but no longer does anything meaningful.
  state.stepPreviewEnabled = true;
}

function saveOutputPaths() {
  state.outputPath        = document.getElementById('outputPathInput')?.value.trim()  || '';
  state.inpaintOutputPath = document.getElementById('inpaintOutputPathInput')?.value.trim() || '';
  state.autoSaveEnabled   = document.getElementById('autoSaveToggle')?.checked || false;
  // Reset sync flags so next save re-scans the new folder for existing file numbers
  delete _counterSynced['default'];
  delete _counterSynced['inpaint'];
  localStorage.setItem('comfyStudioOutputPaths', JSON.stringify({
    outputPath:        state.outputPath,
    inpaintOutputPath: state.inpaintOutputPath,
    autoSave:          state.autoSaveEnabled,
  }));
}

// Per-session sync flag: set to true after we've queried server.js for existing file counts
const _counterSynced = {};

// Query server.js /list once per session per folder to seed the counter from actual disk contents.
// This prevents re-using numbers if localStorage was cleared or files were added externally.
async function syncCounterFromFolder(folderKey) {
  if (_counterSynced[folderKey]) return;
  _counterSynced[folderKey] = true;
  const folderPath = folderKey === 'inpaint' && state.inpaintOutputPath
    ? state.inpaintOutputPath
    : state.outputPath;
  if (!folderPath) return;
  try {
    const res = await fetch('/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    });
    if (!res.ok) return;
    const { files } = await res.json();
    let maxNum = 0;
    for (const f of files) {
      const m = f.match(/^ComfyStudio_(\d+)\.png$/i);
      if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    }
    const storageKey = `comfyStudioFileCounter_${folderKey}`;
    const stored = parseInt(localStorage.getItem(storageKey) || '0');
    if (maxNum > stored) localStorage.setItem(storageKey, String(maxNum));
  } catch(e) { /* server.js not running — counter still works from localStorage */ }
}

// Async version: syncs from disk first, then returns the next filename
async function getNextOutputFilenameAsync(folderKey = 'default') {
  await syncCounterFromFolder(folderKey);
  return getNextOutputFilename(folderKey);
}

// Synchronous version (used as fallback)
// Returns the next sequential filename for a given folder key ('default' or 'inpaint')
// Counters are stored in localStorage so they persist across sessions and increment
// rather than resetting. The format is ComfyStudio_00001.png
function getNextOutputFilename(folderKey = 'default') {
  const storageKey = `comfyStudioFileCounter_${folderKey}`;
  let counter = parseInt(localStorage.getItem(storageKey) || '0') + 1;
  localStorage.setItem(storageKey, String(counter));
  return `ComfyStudio_${String(counter).padStart(5, '0')}.png`;
}

// Determine which folder path to use for a save
// isInpaint: whether this is an inpaint result
function getOutputPath(isInpaint = false) {
  if (isInpaint && state.inpaintOutputPath) return state.inpaintOutputPath;
  return state.outputPath || '';
}

async function saveImageToPath(imageUrl, folderPath, filename) {
  // We can't write to the filesystem directly from a browser — we call server.js.
  // server.js must be running (node server.js) for folder saves to work.
  //
  // server.js expects a base64 data URL. If imageUrl is a blob: URL (which is common
  // when metadata has been embedded), we must first fetch the blob and convert it
  // to a base64 data URL before sending — otherwise server.js receives the literal
  // string "blob:http://..." and writes garbage bytes.
  let dataUrl = imageUrl;
  if (imageUrl.startsWith('blob:')) {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      dataUrl = await readFileAsDataURL(blob);
    } catch (e) {
      showToast('error', 'Save Failed', 'Could not read image data from memory.', 0);
      return false;
    }
  }

  try {
    const res = await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, filename, dataUrl }),
    });
    if (res.ok) {
      showToast('success', 'Image Saved', `Saved to ${folderPath}\\${filename}`, 3000);
      return true;
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('error', 'Save Failed', err.error || 'Server returned an error.', 0);
    }
  } catch(e) {
    // server.js not running
    showToast('error', 'Studio Server Not Running',
      'To save to a folder, run <code>launch.bat</code> to start the Studio server. Falling back to browser download.', 0);
  }
  return false;
}

async function saveImage(isInpaint = false) {
  if (!state.currentImageUrl) return;
  const folderPath = getOutputPath(isInpaint);
  const folderKey  = isInpaint && state.inpaintOutputPath ? 'inpaint' : 'default';
  const filename   = await getNextOutputFilenameAsync(folderKey);

  if (folderPath) {
    // Try to save to path via server.js; if that fails, fall back to browser download
    const saved = await saveImageToPath(state.currentImageUrl, folderPath, filename);
    if (!saved) {
      // Fallback: browser download with the sequential filename
      const a = document.createElement('a');
      a.href = state.currentImageUrl;
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  } else {
    // No folder path configured — standard browser download
    const a = document.createElement('a');
    a.href = state.currentImageUrl;
    a.download = state.currentImageFilename || filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

// Called after every successful generation to handle auto-save
async function maybeAutoSave(isInpaint = false) {
  if (!state.autoSaveEnabled) return;
  const folderPath = getOutputPath(isInpaint);
  if (!folderPath) return;
  const folderKey = isInpaint && state.inpaintOutputPath ? 'inpaint' : 'default';
  const filename  = await getNextOutputFilenameAsync(folderKey);
  await saveImageToPath(state.currentImageUrl, folderPath, filename);
}

// ─────────────────────────────────────────────
// IMAGE INFO BAR
// ─────────────────────────────────────────────
function updateImageInfoBar(meta) {
  if (!meta) return;
  const bar = document.getElementById('imageInfoBar');
  const seedEl = document.getElementById('imgInfoSeed');
  const resEl  = document.getElementById('imgInfoRes');
  bar.style.display = 'flex';
  seedEl.textContent = `Seed: ${meta.seed ?? '—'}`;
  resEl.textContent  = `${meta.resW ?? state.resW} × ${meta.resH ?? state.resH}`;
}

// ─────────────────────────────────────────────
// IMAGE ACTION BAR — Upscale / Use as Base / Variations / Enhance
// ─────────────────────────────────────────────

function toggleUpscaleMode() {
  if (!state.currentImageUrl) return;
  state.imageMode = state.imageMode === 'upscale' ? null : 'upscale';
  updateImageModeUI();
  if (state.imageMode === 'upscale') loadUpscaleModels();
}

function toggleEnhanceMode() {
  if (!state.currentImageUrl) return;
  state.imageMode = state.imageMode === 'enhance' ? null : 'enhance';
  updateImageModeUI();
  if (state.imageMode === 'enhance') loadUpscaleModels();
}

function exitImageMode() {
  state.imageMode = null;
  updateImageModeUI();
}

function updateImageModeUI() {
  const isUpscale = state.imageMode === 'upscale';
  const isEnhance = state.imageMode === 'enhance';

  // Sync legacy state variables just in case they are used elsewhere
  state.upscalePanelOpen = isUpscale;
  state.enhancePanelOpen = isEnhance;

  // Toggle Upscale Elements
  document.getElementById('upscalePanel').style.display = isUpscale ? 'flex' : 'none';
  document.getElementById('upscaleGoBtn').style.display = isUpscale ? 'block' : 'none';

  // Toggle Enhance Elements
  document.getElementById('enhancePanel').style.display = isEnhance ? 'flex' : 'none';
  document.getElementById('enhanceGoBtn').style.display = isEnhance ? 'block' : 'none';

  // Toggle Back Button
  const backBtn = document.getElementById('backModeBtn');
  if (backBtn) backBtn.style.display = state.imageMode ? 'inline-block' : 'none';

  // Update Title
  const imgTitle = document.getElementById('imgTitle');
  if (imgTitle) {
    if (isUpscale) imgTitle.textContent = 'Upscale Mode';
    else if (isEnhance) imgTitle.textContent = 'Enhance Mode';
    else imgTitle.textContent = 'Output';
  }
}

async function doUpscaleGenerate() {
  if (!state.currentImageUrl) return;
  if (state.marblesEnabled && state.marbles < 10) { alert('Need 10 marbles to upscale!'); return; }

  const model = document.getElementById('upscaleModelSelect').value;
  const factor = parseFloat(document.getElementById('upscaleFactorNum').value) || 2;
  showGenOverlay(true);
  document.getElementById('genOverlayText').textContent = 'Upscaling…';

  try {
    // Upload current image, then build upscale workflow
    const blob = await (await fetch(state.currentImageUrl)).blob();
    const file = new File([blob], 'upscale_src.png', {type:'image/png'});
    const fd = new FormData(); fd.append('image', file, file.name);
    const up = await comfyFetch(`${state.comfyUrl}/upload/image`, {method:'POST',body:fd});
    if (!up.ok) throw new Error('Upload failed');
    const {name} = await up.json();

    const nodes = {};
    let nid = 1; const nid_ = () => String(nid++);

    const loadId = nid_();
    nodes[loadId] = { class_type: 'LoadImage', inputs: { image: name, upload: 'image' } };

    const modelId = nid_();
    nodes[modelId] = { class_type: 'UpscaleModelLoader', inputs: { model_name: model } };

    const upscaleId = nid_();
    nodes[upscaleId] = { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: [modelId, 0], image: [loadId, 0] } };

    // Optional rescale to factor
    const scaleId = nid_();
    nodes[scaleId] = {
      class_type: 'ImageScale',
      inputs: {
        image: [upscaleId, 0],
        upscale_method: 'lanczos',
        width: Math.round(state.resW * factor),
        height: Math.round(state.resH * factor),
        crop: 'disabled'
      }
    };

    const saveId = nid_();
    nodes[saveId] = { class_type: 'SaveImage', inputs: { images: [scaleId, 0], filename_prefix: 'ComfyStudio_Upscale' } };

    const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prompt: nodes, client_id: state.clientId })
    });
    if (!res.ok) throw new Error(await res.text());
    const {prompt_id} = await res.json();
    state.lastPromptId = prompt_id;
    state.lastGenMeta = { ...state.lastGenMeta, resW: Math.round(state.resW*factor), resH: Math.round(state.resH*factor) };
    await pollForImages(prompt_id, 1);
    deductMarbles(10);
  } catch(e) {
    showGenOverlay(false);
    showGenOverlay(false);
    clearProgress();
    resetBtn();
    showToast('error', 'Upscale Failed', e.message || String(e));
  }
}

// USE AS BASE
function useAsBase() {
  if (!state.currentImageUrl) return;
  // Fetch the current displayed image and set as img2img
  fetch(state.currentImageUrl)
    .then(r => r.blob())
    .then(blob => {
      const file = new File([blob], 'base.png', {type:'image/png'});
      setImg2Img(file, state.currentImageUrl);
    })
    .catch(e => console.warn('Use as base failed:', e));
}

// GENERATE VARIATIONS
async function generateVariations() {
  if (!state.currentImageUrl || state.generating) return;
  if (state.marblesEnabled && state.marbles < 30) { alert('Need 30 marbles!'); return; }

  const denoise = parseFloat(document.getElementById('varDenoiseNum').value) || 0.6;
  const batchSize = parseInt(document.getElementById('varBatchNum').value) || 1;

  // Set as img2img with variation denoise
  const blob = await (await fetch(state.currentImageUrl)).blob();
  const file = new File([blob], 'variation_src.png', {type:'image/png'});
  setImg2Img(file, state.currentImageUrl);
  document.getElementById('img2imgDenoise').value = denoise;
  document.getElementById('img2imgDenoiseVal').textContent = denoise.toFixed(2);
  document.getElementById('batchNum').value = batchSize;
  syncNum('batch');

  await generate();
  if (state.marblesEnabled) deductMarbles(30);
}

async function doEnhance() {
  if (!state.currentImageUrl) return;
  if (state.marblesEnabled && state.marbles < 30) { alert('Need 30 marbles!'); return; }

  const upscaleModel  = document.getElementById('enhanceUpscaleModel').value;
  const upscaleFactor = parseFloat(document.getElementById('enhanceUpscaleFactor').value) || 2;
  const denoise       = parseFloat(document.getElementById('enhanceDenoiseNum').value) || 0.4;
  const enhSteps      = parseInt(document.getElementById('enhanceStepsNum').value) || 20;
  const enhCFG        = parseFloat(document.getElementById('enhanceCFGNum').value) || 7;
  const enhSampler    = document.getElementById('enhanceSampler').value;
  const enhScheduler  = document.getElementById('enhanceScheduler').value;
  let enhSeed = parseInt(document.getElementById('enhanceSeed').value);
  if (enhSeed === -1) enhSeed = Math.floor(Math.random() * 2**32);

  showGenOverlay(true);
  document.getElementById('genOverlayText').textContent = 'Enhancing…';

  try {
    const blob = await (await fetch(state.currentImageUrl)).blob();
    const file = new File([blob], 'enhance_src.png', {type:'image/png'});
    const fd = new FormData(); fd.append('image', file, file.name);
    const up = await comfyFetch(`${state.comfyUrl}/upload/image`, {method:'POST',body:fd});
    if (!up.ok) throw new Error('Upload failed');
    const {name} = await up.json();

    const nodes = {};
    let nid = 1; const id = () => String(nid++);

    // Load model for enhance pass (use enhance-specific selection)
    let modelSrc, clipSrc, vaeSrc;
    if (state.enhanceModelType === 'diffusion') {
      const unetId = id();
      nodes[unetId] = {
        class_type: 'UNETLoader',
        inputs: { unet_name: document.getElementById('enhanceDiffusionSelect').value, weight_dtype: 'default' }
      };
      modelSrc = [unetId, 0];
      // Use enhance-panel VAE (fall back to main VAE if enhance panel has none selected)
      const enhVaeRaw = document.getElementById('enhanceVaeSelect')?.value;
      const vaeRaw = (enhVaeRaw && enhVaeRaw !== 'Automatic (embedded)') ? enhVaeRaw : document.getElementById('vaeSelect').value;
      if (vaeRaw && vaeRaw !== 'Automatic (embedded)') {
        const vaeId = id();
        nodes[vaeId] = { class_type: 'VAELoader', inputs: { vae_name: vaeRaw } };
        vaeSrc = [vaeId, 0];
      }
      // Use enhance-panel CLIP/TE (not main panel)
      const teVal  = document.getElementById('enhanceTeSelect')?.value;
      const teType = document.getElementById('enhanceTeType')?.value || 'stable_diffusion';
      if (teVal && teVal !== 'none') {
        const teId = id();
        nodes[teId] = { class_type: 'CLIPLoader', inputs: { clip_name: teVal, type: teType } };
        clipSrc = [teId, 0];
      }
    } else {
      const ckptId = id();
      nodes[ckptId] = {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: document.getElementById('enhanceCheckpointSelect').value }
      };
      modelSrc = [ckptId, 0]; clipSrc = [ckptId, 1]; vaeSrc = [ckptId, 2];
    }

    const loadId = id();
    nodes[loadId] = { class_type: 'LoadImage', inputs: { image: name, upload: 'image' } };

    const upModelId = id();
    nodes[upModelId] = { class_type: 'UpscaleModelLoader', inputs: { model_name: upscaleModel } };

    const upscaleId = id();
    nodes[upscaleId] = { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: [upModelId,0], image: [loadId,0] } };

    const scaleId = id();
    nodes[scaleId] = {
      class_type: 'ImageScale',
      inputs: { image: [upscaleId,0], upscale_method:'lanczos',
        width: Math.round(state.resW * upscaleFactor),
        height: Math.round(state.resH * upscaleFactor), crop:'disabled' }
    };

    const encId = id();
    nodes[encId] = { class_type: 'VAEEncode', inputs: { pixels: [scaleId,0], vae: vaeSrc } };

    const posId = id();
    nodes[posId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: getEnhancePositivePrompt() } };
    const negId = id();
    nodes[negId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: getEnhanceNegativePrompt() } };

    const ksId = id();
    nodes[ksId] = {
      class_type: 'KSampler',
      inputs: {
        model: modelSrc, positive: [posId,0], negative: [negId,0],
        latent_image: [encId,0],
        seed: enhSeed, steps: enhSteps, cfg: enhCFG,
        sampler_name: enhSampler, scheduler: enhScheduler, denoise,
      }
    };

    const decId = id();
    nodes[decId] = { class_type: 'VAEDecode', inputs: { samples: [ksId,0], vae: vaeSrc } };

    const saveId = id();
    nodes[saveId] = { class_type: 'SaveImage', inputs: { images: [decId,0], filename_prefix: 'ComfyStudio_Enhanced' } };

    const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt: nodes, client_id: state.clientId })
    });
    if (!res.ok) throw new Error(await res.text());
    const {prompt_id} = await res.json();
    state.lastPromptId = prompt_id;
    state.lastGenMeta = { ...state.lastGenMeta, resW: Math.round(state.resW*upscaleFactor), resH: Math.round(state.resH*upscaleFactor) };
    await pollForImages(prompt_id, 1);
    deductMarbles(30);
  } catch(e) {
    showGenOverlay(false);
    showGenOverlay(false);
    clearProgress();
    resetBtn();
    showToast('error', 'Enhance Failed', e.message || String(e));
  }
}

// ─────────────────────────────────────────────
// NOTIFICATION SOUND
// ─────────────────────────────────────────────
function playNotifSound() {
  if (!state.notifSoundEnabled) return;
  try {
    const audio = new Audio('notif.mp3');
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch(e) {}
}

function testNotifSound() {
  const audio = new Audio('notif.mp3');
  audio.volume = 0.7;
  audio.play().catch(() => alert('Could not play notif.mp3 — make sure the file exists next to the HTML.'));
}

// ─────────────────────────────────────────────
// MARBLES
// ─────────────────────────────────────────────
function toggleMarbles(enabled) {
  state.marblesEnabled = enabled;
  document.getElementById('marblesDisplay').style.display = enabled ? 'flex' : 'none';
  saveMarbles();
}

function addMarbles() {
  const amt = parseInt(document.getElementById('marblesAddInput').value) || 0;
  state.marbles += amt;
  updateMarblesDisplay();
  saveMarbles();
}

function deductMarbles(cost) {
  if (!state.marblesEnabled) return;
  state.marbles = Math.max(0, state.marbles - cost);
  updateMarblesDisplay();
  saveMarbles();
}

function updateMarblesDisplay() {
  document.getElementById('marblesCount').textContent = state.marbles;
}

function saveMarbles() {
  localStorage.setItem('comfyStudioMarbles', JSON.stringify({ enabled: state.marblesEnabled, amount: state.marbles }));
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function showGenOverlay(show) {
  document.getElementById('genOverlay').style.display = show ? 'flex' : 'none';
  if (show) document.getElementById('imgPlaceholder').style.display = 'none';
  if (!show) {
    clearStepPreview();
    const gpo = document.getElementById('genProgressOverlay');
    if (gpo) gpo.style.display = 'none';
  }
}

function resetBtn() {
  state.generating = false;
  const btn = document.getElementById('generateBtn');
  btn.classList.remove('loading');
  document.getElementById('genBtnText').textContent = 'Generate';
  document.getElementById('batchCounter').style.display = 'none';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// CARD BODY RESIZE HANDLES
// ─────────────────────────────────────────────
function setupCardResizeHandles() {
  document.querySelectorAll('.card-resize-handle').forEach(handle => {
    const card = handle.closest('.pcard');
    const body = card.querySelector('.pcard-body');
    const naturalH = body.getBoundingClientRect().height;
    body.style.minHeight = naturalH + 'px';
    let dragging = false, startY = 0, startH = 0;
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); dragging = true;
      startY = e.clientY; startH = body.getBoundingClientRect().height;
      handle.classList.add('dragging');
      document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      body.style.minHeight = Math.max(naturalH, startH + (e.clientY - startY)) + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false; handle.classList.remove('dragging');
      document.body.style.userSelect = ''; document.body.style.cursor = '';
    });
  });
}

// ─────────────────────────────────────────────
// LEFT PANEL RESIZE HANDLE
// ─────────────────────────────────────────────
function setupResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  const panel  = document.getElementById('leftPanel');
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.width = Math.min(700, Math.max(260, startW + (e.clientX - startX))) + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; handle.classList.remove('dragging');
    document.body.style.userSelect = ''; document.body.style.cursor = '';
  });
}

// ─────────────────────────────────────────────
// PERSISTENCE (localStorage)
// ─────────────────────────────────────────────
let saveTimeout;
function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveSession, 1000);
}

function saveSession() {
  const sp = state.savePrefs;
  const data = {};

  if (sp['save-comfyUrl'])        data.comfyUrl       = document.getElementById('comfyUrl')?.value;
  if (sp['save-positivePrompt'])  data.positivePrompt  = document.getElementById('positivePrompt')?.value;
  if (sp['save-negativePrompt'])  data.negativePrompt  = document.getElementById('negativePrompt')?.value;
  if (sp['save-modelType'])       data.modelType       = state.modelType;
  if (sp['save-checkpointSelect'])data.checkpointSelect= document.getElementById('checkpointSelect')?.value;
  if (sp['save-diffusionSelect']) data.diffusionSelect = document.getElementById('diffusionSelect')?.value;
  if (sp['save-vaeSelect'])       data.vaeSelect       = document.getElementById('vaeSelect')?.value;
  if (sp['save-teSelect'])        { data.teSelect = document.getElementById('teSelect')?.value; data.teType = document.getElementById('teType')?.value; }
  if (sp['save-sampler'])         { data.samplerName = document.getElementById('samplerName')?.value; data.scheduler = document.getElementById('scheduler')?.value; }
  if (sp['save-steps'])           data.stepsNum        = document.getElementById('stepsNum')?.value;
  if (sp['save-cfg'])             data.cfgNum          = document.getElementById('cfgNum')?.value;
  if (sp['save-denoise'])         data.denoiseNum      = document.getElementById('denoiseNum')?.value;
  if (sp['save-batch'])           data.batchNum        = document.getElementById('batchNum')?.value;
  if (sp['save-resolution'])      { data.resCategory = state.resCategory; data.resOrient = state.resOrient; data.resStandard = state.resStandard; data.resW = state.resW; data.resH = state.resH; }
  if (sp['save-customRes'])       { data.customMode = state.customMode; data.customW = document.getElementById('customW')?.value; data.customH = document.getElementById('customH')?.value; }
  if (sp['save-seed'])            { data.seedInput = document.getElementById('seedInput')?.value; data.seedLocked = state.seedLocked; }
  if (sp['save-characters'])      { data.characters = state.characters; data.charCounter = state.charCounter; }
  if (sp['save-loras'])           data.loras           = getActiveLoRAs();
  if (sp['save-qualityTags'])     { data.qualityTagsEnabled = state.qualityTagsEnabled; data.qualityTagsText = document.getElementById('qualityTagsText')?.value; data.negQualityTagsEnabled = state.negQualityTagsEnabled; data.negQualityTagsText = document.getElementById('negQualityTagsText')?.value; }
  if (sp['save-img2imgDenoise'])    data.img2imgDenoise    = document.getElementById('img2imgDenoise')?.value;
  if (sp['save-vPrediction'])     data.vPrediction     = state.vPrediction;
  if (sp['save-rescaleCFG'])      { data.rescaleCFGEnabled = state.rescaleCFGEnabled; data.rescaleCFGMultiplier = parseFloat(document.getElementById('rescaleCFGNum')?.value) || 0.7; }
  if (sp['save-varSettings'])     { data.varDenoise = document.getElementById('varDenoiseNum')?.value; data.varBatch = document.getElementById('varBatchNum')?.value; }
  if (sp['save-enhanceSettings']) {
    data.enhanceModelType       = state.enhanceModelType;
    data.enhanceCheckpointSelect= document.getElementById('enhanceCheckpointSelect')?.value;
    data.enhanceDiffusionSelect = document.getElementById('enhanceDiffusionSelect')?.value;
    data.enhanceVaeSelect       = document.getElementById('enhanceVaeSelect')?.value;
    data.enhanceTeSelect        = document.getElementById('enhanceTeSelect')?.value;
    data.enhanceTeType          = document.getElementById('enhanceTeType')?.value;
    data.enhanceUpscaleModel    = document.getElementById('enhanceUpscaleModel')?.value;
    data.enhanceUpscaleFactor   = document.getElementById('enhanceUpscaleFactor')?.value;
    data.enhanceDenoiseNum      = document.getElementById('enhanceDenoiseNum')?.value;
    data.enhanceSeed            = document.getElementById('enhanceSeed')?.value;
    data.enhanceStepsNum        = document.getElementById('enhanceStepsNum')?.value;
    data.enhanceCFGNum          = document.getElementById('enhanceCFGNum')?.value;
    data.enhanceSampler         = document.getElementById('enhanceSampler')?.value;
    data.enhanceScheduler       = document.getElementById('enhanceScheduler')?.value;
  }

  localStorage.setItem('comfyStudioSession', JSON.stringify(data));
  localStorage.setItem('comfyStudioNotif', state.notifSoundEnabled);

  // Honor save prefs for independently-stored keys
  if (!sp['save-theme'])           localStorage.removeItem('comfyStudioTheme');
  if (!sp['save-panelCollapse'])   localStorage.removeItem('comfyCollapseState');
  if (!sp['save-notes'])           { localStorage.removeItem('comfyStudioNotes'); localStorage.removeItem('comfyStudioNotes_content'); }
  if (!sp['save-wildcards'])       localStorage.removeItem('comfyStudioWildcards');
  if (!sp['save-promptLibrary'])   { localStorage.removeItem('comfyStudioPL'); localStorage.removeItem('comfyStudioPLPrepend'); }
  if (!sp['save-experimentalToggles']) {
    localStorage.removeItem('comfyStudioInpaint');
    localStorage.removeItem('comfyStudioIPA');
    localStorage.removeItem('comfyStudioCN');
    localStorage.removeItem('comfyStudioCaption');
    localStorage.removeItem('comfyStudioCG');
  }

  // Flash status hint if save tab is open
  const hint = document.getElementById('saveStatusHint');
  if (hint) { hint.textContent = '✓ Saved.'; setTimeout(() => { hint.textContent = ''; }, 2000); }
}

function loadSessionStart() {
  const raw = localStorage.getItem('comfyStudioSession');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) {
        el.value = val;
        if (id.endsWith('Num')) syncNum(id.replace('Num', ''));
      }
    };
    setVal('comfyUrl', data.comfyUrl);
    setVal('positivePrompt', data.positivePrompt);
    setVal('negativePrompt', data.negativePrompt);
    setVal('samplerName', data.samplerName);
    setVal('scheduler', data.scheduler);
    setVal('stepsNum', data.stepsNum);
    setVal('cfgNum', data.cfgNum);
    setVal('denoiseNum', data.denoiseNum);
    setVal('batchNum', data.batchNum);
    setVal('customW', data.customW);
    setVal('customH', data.customH);
    setVal('seedInput', data.seedInput);

    if (data.resCategory) {
      state.resCategory = data.resCategory;
      state.resOrient   = data.resOrient   || 'portrait';
      state.resStandard = data.resStandard || 'sdxl';
      document.getElementById('resCategorySelect').value = state.resCategory;
      document.getElementById('resOrientSelect').value   = state.resOrient;
      document.getElementById('resStandardSelect').value = state.resStandard;
      if (state.resCategory === 'custom') {
        state.resW = data.resW || 512; state.resH = data.resH || 512;
        state.customMode = true;
        document.getElementById('customResWrap').classList.add('open');
        document.getElementById('resOrientWrap').style.display = 'none';
        document.getElementById('resStandardWrap').style.display = 'none';
      } else {
        updateResFromTable();
      }
    } else if (data.resW) {
      state.resW = data.resW; state.resH = data.resH;
    }
    updateResDisplay();

    if (data.seedLocked) {
      state.seedLocked = true;
      const btn = document.getElementById('lockSeedBtn');
      if (btn) { btn.textContent = '🔒'; btn.title = 'Seed locked'; btn.classList.add('locked'); }
    }

    if (data.modelType) {
      state.modelType = data.modelType;
      document.getElementById('checkpointRow')?.classList.toggle('hidden', state.modelType !== 'checkpoint');
      document.getElementById('diffusionRow')?.classList.toggle('hidden', state.modelType !== 'diffusion');
      document.querySelectorAll('.seg-btn').forEach(b => {
        b.classList.toggle('active', b.textContent.toLowerCase().includes(state.modelType.substring(0,4)));
      });
    }

    if (data.qualityTagsEnabled) {
      state.qualityTagsEnabled = true;
      document.getElementById('qualityTagsEnabled').checked = true;
    }
    if (data.qualityTagsText) {
      document.getElementById('qualityTagsText').value = data.qualityTagsText;
      state.qualityTagsText = data.qualityTagsText;
    }
    if (data.negQualityTagsEnabled) {
      state.negQualityTagsEnabled = true;
      document.getElementById('negQualityTagsEnabled').checked = true;
    }
    if (data.negQualityTagsText) {
      document.getElementById('negQualityTagsText').value = data.negQualityTagsText;
      state.negQualityTagsText = data.negQualityTagsText;
    }

    if (data.vPrediction) {
      state.vPrediction = true;
      document.getElementById('vPredictionToggle').checked = true;
    }
    if (data.rescaleCFGEnabled) {
      state.rescaleCFGEnabled = true;
      document.getElementById('rescaleCFGToggle').checked = true;
      document.getElementById('rescaleCFGSliderWrap').style.display = 'flex';
    }
    if (data.rescaleCFGMultiplier != null) {
      document.getElementById('rescaleCFGNum').value = data.rescaleCFGMultiplier;
      syncNum('rescaleCFG');
    }
    if (data.varDenoise != null) { setVal('varDenoiseNum', data.varDenoise); }
    if (data.varBatch != null)   { setVal('varBatchNum', data.varBatch); }
    if (data.img2imgDenoise != null) {
      const el = document.getElementById('img2imgDenoise');
      if (el) { el.value = data.img2imgDenoise; document.getElementById('img2imgDenoiseVal').textContent = parseFloat(data.img2imgDenoise).toFixed(2); }
    }

    if (data.characters && data.characters.length > 0) {
      document.getElementById('characterList').innerHTML = '';
      state.characters = [];
      state.charCounter = data.charCounter || 0;
      data.characters.forEach(savedChar => {
        state.charCounter = savedChar.id - 1;
        addCharacter();
        const item = document.querySelector(`.char-item[data-charid="${savedChar.id}"]`);
        if (item) {
          item.querySelector('.char-keyword-input').value = savedChar.keyword;
          item.querySelector('.char-ta').value = savedChar.prompt;
          const ch = state.characters.find(c => c.id === savedChar.id);
          if (ch) {
            ch.keyword = savedChar.keyword; ch.prompt = savedChar.prompt;
            if (!savedChar.enabled) {
              const toggleBtn = Array.from(item.querySelectorAll('button')).find(b => b.textContent === '◉');
              if (toggleBtn) toggleCharacter(toggleBtn);
            }
          }
        }
      });
      state.charCounter = data.charCounter;
    }

    updatePromptHighlight('positive');
    updatePromptHighlight('negative');
    return data;
  } catch(e) {
    console.error('Session load failed:', e);
    return null;
  }
}

function loadSessionModels(data) {
  if (!data) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  setVal('checkpointSelect', data.checkpointSelect);
  setVal('diffusionSelect', data.diffusionSelect);
  setVal('vaeSelect', data.vaeSelect);
  setVal('teSelect', data.teSelect);
  setVal('teType', data.teType);

  // Restore enhance model selections
  if (data.enhanceModelType) {
    state.enhanceModelType = data.enhanceModelType;
    const checkRow = document.getElementById('enhanceCheckpointRow');
    const diffRow  = document.getElementById('enhanceDiffusionRow');
    if (checkRow) checkRow.classList.toggle('hidden', data.enhanceModelType !== 'checkpoint');
    if (diffRow)  diffRow.classList.toggle('hidden', data.enhanceModelType !== 'diffusion');
    // Update segmented buttons in enhance card
    document.querySelectorAll('.enh-seg').forEach(b => {
      b.classList.toggle('active', b.textContent.toLowerCase().startsWith(data.enhanceModelType.substring(0,4)));
    });
  }
  setVal('enhanceCheckpointSelect', data.enhanceCheckpointSelect);
  setVal('enhanceDiffusionSelect',  data.enhanceDiffusionSelect);
  setVal('enhanceVaeSelect',        data.enhanceVaeSelect);
  setVal('enhanceTeSelect',         data.enhanceTeSelect);
  setVal('enhanceTeType',           data.enhanceTeType);
  setVal('enhanceUpscaleModel',     data.enhanceUpscaleModel);
  if (data.enhanceUpscaleFactor != null) setVal('enhanceUpscaleFactor', data.enhanceUpscaleFactor);
  if (data.enhanceDenoiseNum != null)    { document.getElementById('enhanceDenoiseNum').value = data.enhanceDenoiseNum; syncNum('enhanceDenoise'); }
  if (data.enhanceSeed != null)          setVal('enhanceSeed', data.enhanceSeed);
  if (data.enhanceStepsNum != null)      { document.getElementById('enhanceStepsNum').value = data.enhanceStepsNum; syncNum('enhanceSteps'); }
  if (data.enhanceCFGNum != null)        { document.getElementById('enhanceCFGNum').value = data.enhanceCFGNum; syncNum('enhanceCFG'); }
  setVal('enhanceSampler',  data.enhanceSampler);
  setVal('enhanceScheduler',data.enhanceScheduler);

  if (data.loras && data.loras.length > 0) {
    document.getElementById('loraList').innerHTML = '';
    data.loras.forEach(l => {
      addLora();
      const items = document.querySelectorAll('.lora-item');
      const lastItem = items[items.length - 1];
      if (lastItem) {
        lastItem.querySelector('.lora-sel').value = l.name;
        const searchInput = lastItem.querySelector('.lora-search-input');
        if (searchInput) searchInput.value = l.name;
        const num = lastItem.querySelector('.lora-num');
        num.value = l.strength;
        loraNumInput(num);
      }
    });
  }
}

// Auto-save on inputs/clicks
document.addEventListener('input', scheduleSave);
document.addEventListener('change', scheduleSave);
document.addEventListener('click', e => {
  if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) scheduleSave();
});
// ─────────────────────────────────────────────
// SAVE PREFERENCES (was missing)
// ─────────────────────────────────────────────
function updateSavePrefs() {
  document.querySelectorAll('.save-chk').forEach(chk => {
    state.savePrefs[chk.id] = chk.checked;
  });
  localStorage.setItem('comfyStudioSavePrefs', JSON.stringify(state.savePrefs));
}

function confirmClearSave() {
  showConfirm('Clear all saved session data? The page will reload.', () => {
    localStorage.removeItem('comfyStudioSession');
    localStorage.removeItem('comfyStudioSavePrefs');
    const hint = document.getElementById('saveStatusHint');
    if (hint) hint.textContent = '✓ Cleared. Reloading…';
    setTimeout(() => location.reload(), 800);
  });
}

// ─────────────────────────────────────────────
// ENHANCE MODEL CARD COLLAPSE (was missing)
// ─────────────────────────────────────────────
function toggleEnhanceModelCard() {
  const card = document.getElementById('enhanceModelCard');
  if (!card) return;
  card.classList.toggle('collapsed');
}

// ─────────────────────────────────────────────
// INPAINT EXPERIMENTAL TOGGLE
// ─────────────────────────────────────────────
function toggleInpaint(enabled) {
  state.inpaintEnabled = enabled;
  localStorage.setItem('comfyStudioInpaint', enabled);
  updateInpaintBtnVisibility();
}

// ─────────────────────────────────────────────
// IP ADAPTER
// ─────────────────────────────────────────────
function toggleIPAdapter(enabled) {
  state.ipAdapterEnabled = enabled;
  localStorage.setItem('comfyStudioIPA', enabled);
  const card = document.getElementById('ipAdapterCard');
  if (card) card.style.display = enabled ? '' : 'none';
  if (enabled) loadModels(); // refresh model lists
}

function handleIPAImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.ipaImageDataUrl = e.target.result;
    document.getElementById('ipaPreviewImg').src = e.target.result;
    document.getElementById('ipaPreviewWrap').style.display = '';
    document.getElementById('ipaDropHint').style.display = 'none';
    // Upload to ComfyUI so we have a server-side filename for the workflow
    uploadImageToComfy(file, name => { state.ipaImageName = name; });
  };
  reader.readAsDataURL(file);
}

function clearIPAImage(e) {
  e.stopPropagation();
  state.ipaImageDataUrl = null;
  state.ipaImageName = null;
  document.getElementById('ipaPreviewImg').src = '';
  document.getElementById('ipaPreviewWrap').style.display = 'none';
  document.getElementById('ipaDropHint').style.display = '';
  document.getElementById('ipaImageInput').value = '';
}

// ─────────────────────────────────────────────
// CONTROLNET
// ─────────────────────────────────────────────
function toggleControlNet(enabled) {
  state.controlNetEnabled = enabled;
  localStorage.setItem('comfyStudioCN', enabled);
  const card = document.getElementById('controlNetCard');
  if (card) card.style.display = enabled ? '' : 'none';
  if (enabled) loadModels();
}

function handleCNImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.cnImageDataUrl = e.target.result;
    document.getElementById('cnPreviewImg').src = e.target.result;
    document.getElementById('cnPreviewWrap').style.display = '';
    document.getElementById('cnDropHint').style.display = 'none';
    uploadImageToComfy(file, name => { state.cnImageName = name; });
  };
  reader.readAsDataURL(file);
}

function clearCNImage(e) {
  e.stopPropagation();
  state.cnImageDataUrl = null;
  state.cnImageName = null;
  document.getElementById('cnPreviewImg').src = '';
  document.getElementById('cnPreviewWrap').style.display = 'none';
  document.getElementById('cnDropHint').style.display = '';
  document.getElementById('cnImageInput').value = '';
}

// Shared helper: upload an image file to ComfyUI /upload/image
// Calls callback(name) with the server-assigned filename on success
async function uploadImageToComfy(file, callback) {
  try {
    const fd = new FormData();
    fd.append('image', file, file.name);
    const res = await comfyFetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Upload failed');
    const { name } = await res.json();
    callback(name);
  } catch(e) {
    showToast('error', 'Upload Failed', 'Could not upload image to ComfyUI: ' + (e.message || e));
  }
}

// ─────────────────────────────────────────────
// NOTES FEATURE
// ─────────────────────────────────────────────
function toggleNotesFeature(enabled) {
  const tab = document.getElementById('notesTab');
  if (tab) tab.style.display = enabled ? '' : 'none';
  if (!enabled) {
    // Switch away from notes if active
    const activeTab = document.querySelector('.ptab.active');
    if (activeTab && activeTab.id === 'notesTab') {
      const posBtn = document.querySelector('.ptab:first-child');
      if (posBtn) switchPromptTab('positive', posBtn);
    }
  }
  localStorage.setItem('comfyStudioNotes', enabled);
}

function toggleHideCharacters(enabled) {
  const card = document.getElementById('charactersCard');
  if (card) card.style.display = enabled ? 'none' : '';
  localStorage.setItem('comfyStudioHideChars', enabled);
}

function saveNotesContent() {
  const ta = document.getElementById('notesTextarea');
  if (ta) localStorage.setItem('comfyStudioNotes_content', ta.value);
}

// ─────────────────────────────────────────────
// ENHANCE PROMPT TOGGLE
// ─────────────────────────────────────────────
function toggleEnhancePrompt(enabled) {
  const wrap = document.getElementById('enhancePromptWrap');
  if (wrap) wrap.style.display = enabled ? 'block' : 'none';
  state.enhancePromptEnabled = enabled;
  if (enabled) {
    // Wire highlight updates for enhance textareas (idempotent — handlers are cheap)
    const ePos = document.getElementById('enhancePrompt');
    const eNeg = document.getElementById('enhanceNegativePrompt');
    if (ePos) {
      ePos.addEventListener('input', () => updateEnhanceHighlight('pos'));
      ePos.addEventListener('scroll', () => syncEnhanceHighlightScroll('pos'));
      updateEnhanceHighlight('pos');
    }
    if (eNeg) {
      eNeg.addEventListener('input', () => updateEnhanceHighlight('neg'));
      eNeg.addEventListener('scroll', () => syncEnhanceHighlightScroll('neg'));
      updateEnhanceHighlight('neg');
    }
  }
}

function updateEnhanceHighlight(which) {
  const ta    = document.getElementById(which === 'pos' ? 'enhancePrompt' : 'enhanceNegativePrompt');
  const layer = document.getElementById(which === 'pos' ? 'highlightLayerEnhancePos' : 'highlightLayerEnhanceNeg');
  if (!ta || !layer) return;
  if (!state.modifierHighlightEnabled) { layer.innerHTML = ''; return; }
  layer.innerHTML = escapeHTMLPreserveStructure(ta.value);
  const cs = getComputedStyle(ta);
  layer.style.fontSize      = cs.fontSize;
  layer.style.lineHeight    = cs.lineHeight;
  layer.style.fontFamily    = cs.fontFamily;
  layer.style.letterSpacing = cs.letterSpacing;
  layer.style.width         = ta.clientWidth + 'px';
  syncEnhanceHighlightScroll(which);
}

function syncEnhanceHighlightScroll(which) {
  const ta    = document.getElementById(which === 'pos' ? 'enhancePrompt' : 'enhanceNegativePrompt');
  const layer = document.getElementById(which === 'pos' ? 'highlightLayerEnhancePos' : 'highlightLayerEnhanceNeg');
  if (!ta || !layer) return;
  layer.scrollTop  = ta.scrollTop;
  layer.scrollLeft = ta.scrollLeft;
}

function getEnhancePositivePrompt() {
  if (state.enhancePromptEnabled) {
    const ta = document.getElementById('enhancePrompt');
    if (ta && ta.value.trim()) return ta.value.trim();
  }
  return buildPositivePrompt();
}

function getEnhanceNegativePrompt() {
  if (state.enhancePromptEnabled) {
    const ta = document.getElementById('enhanceNegativePrompt');
    if (ta && ta.value.trim()) return ta.value.trim();
  }
  return buildNegativePrompt();
}

// ─────────────────────────────────────────────
// SAVE METADATA SETTING
// ─────────────────────────────────────────────
// Initialise in state
state.saveMetadataEnabled = true;
state.saveLorasMeta = localStorage.getItem('comfyStudioSaveLorasMeta') !== 'false';

// ─────────────────────────────────────────────
// WILDCARDS  (keyword-based, {{wc:name}} syntax)
// ─────────────────────────────────────────────
// wildcards: [{ name, tags: ['tag1','tag2',...] }]
state.wildcards = [];

function renderWildcardList() {
  const list = document.getElementById('wildcardList');
  const empty = document.getElementById('wildcardEmpty');
  if (!list) return;
  // Remove all chips
  list.querySelectorAll('.wildcard-chip').forEach(c => c.remove());
  if (state.wildcards.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  state.wildcards.forEach((wc, idx) => {
    const chip = document.createElement('div');
    chip.className = 'wildcard-chip';
    chip.title = `{{wc:${wc.name}}} — ${wc.tags.length} tag(s)`;
    chip.innerHTML = `<span class="wildcard-chip-name">{{wc:${wc.name}}}</span><button class="wildcard-chip-edit" onclick="event.stopPropagation();openWildcardEditor(${idx})" title="Edit">✏</button>`;
    list.appendChild(chip);
  });
}

function addWildcard() {
  openWildcardEditor(-1);
}

let _editingWildcardIdx = -1;

function openWildcardEditor(idx) {
  _editingWildcardIdx = idx;
  const modal = document.getElementById('wildcardEditorModal');
  const backdrop = document.getElementById('wildcardEditorBackdrop');
  const nameInput = document.getElementById('wildcardEditorName');
  const tagsArea = document.getElementById('wildcardEditorTags');
  const deleteBtn = document.getElementById('wildcardDeleteBtn');

  if (idx >= 0 && state.wildcards[idx]) {
    nameInput.value = state.wildcards[idx].name;
    tagsArea.value = state.wildcards[idx].tags.join('\n');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
  } else {
    nameInput.value = '';
    tagsArea.value = '';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  modal.classList.add('open');
  backdrop.classList.add('open');
  nameInput.focus();
}

function closeWildcardEditor() {
  document.getElementById('wildcardEditorModal').classList.remove('open');
  document.getElementById('wildcardEditorBackdrop').classList.remove('open');
}

function saveWildcardEditor() {
  const name = document.getElementById('wildcardEditorName').value.trim().replace(/\s+/g, '_');
  const rawTags = document.getElementById('wildcardEditorTags').value;
  if (!name) { showToast('error', 'Wildcard Error', 'Please enter a name.', 3000); return; }

  const tags = rawTags.split('\n').map(t => t.trim()).filter(Boolean);
  if (tags.length === 0) { showToast('error', 'Wildcard Error', 'Add at least one tag.', 3000); return; }

  if (_editingWildcardIdx >= 0) {
    state.wildcards[_editingWildcardIdx] = { name, tags };
  } else {
    // Check for duplicate name
    if (state.wildcards.find(w => w.name === name)) {
      showToast('error', 'Wildcard Error', `A wildcard named "${name}" already exists.`, 3000);
      return;
    }
    state.wildcards.push({ name, tags });
  }

  saveWildcards();
  renderWildcardList();
  closeWildcardEditor();
  showToast('success', 'Wildcard Saved', `{{wc:${name}}} with ${tags.length} tag(s) saved.`, 2500);
}

function deleteWildcardFromEditor() {
  if (_editingWildcardIdx < 0) return;
  const name = state.wildcards[_editingWildcardIdx]?.name || '';
  showConfirm(`Delete wildcard "${name}"? This cannot be undone.`, () => {
    state.wildcards.splice(_editingWildcardIdx, 1);
    saveWildcards();
    renderWildcardList();
    closeWildcardEditor();
  });
}

function saveWildcards() {
  localStorage.setItem('comfyStudioWildcards', JSON.stringify(state.wildcards));
}

function loadWildcards() {
  try {
    const saved = localStorage.getItem('comfyStudioWildcards');
    if (saved) state.wildcards = JSON.parse(saved);
  } catch(e) {}
  renderWildcardList();
}

// Resolve {{wc:name}} keywords in prompt text — replaces each with a random tag
function resolveWildcards(text) {
  return text.replace(/\{\{wc:([^}]+)\}\}/g, (match, name) => {
    const wc = state.wildcards.find(w => w.name === name.trim());
    if (!wc || !wc.tags.length) return match; // leave unchanged if not found
    const randomTag = wc.tags[Math.floor(Math.random() * wc.tags.length)];
    return randomTag;
  });
}

// ─────────────────────────────────────────────
// DRAW ON IMAGE MENU
// ─────────────────────────────────────────────
const drawState = {
  tool: 'brush',   // 'brush' | 'eraser' | 'eyedrop' | 'fill' | 'lasso'
  // legacy aliases (kept for backward compat with drawDot/drawLine)
  get isEraser()  { return this.tool === 'eraser'; },
  get isEyedrop() { return this.tool === 'eyedrop'; },
  painting: false,
  color: '#ff6b9d',
  brushSize: 12,
  ctx: null,
  lastX: 0, lastY: 0,
  // lasso state
  lasso: {
    active: false,       // currently drawing lasso path
    points: [],          // [{x,y}] in canvas display coords
    closed: false,
    floatData: null,     // ImageData of the floated selection (display size)
    floatNatData: null,  // ImageData at natural resolution (for compositing)
    floatX: 0, floatY: 0, // top-left of float in display coords
    dragging: false,
    dragStartX: 0, dragStartY: 0,
    floatStartX: 0, floatStartY: 0,
    clipboard: null,     // saved ImageData for paste { data, w, h } at nat res
  },
  // canvas expansion state
  expand: {
    active: false,
    dir: null,
    startX: 0, startY: 0,
    origW: 0, origH: 0,
    origImgW: 0, origImgH: 0,
  },
};

function openDrawMenu() {
  if (!state.img2imgDataUrl) return;
  const modal    = document.getElementById('drawModal');
  const backdrop = document.getElementById('drawModalBackdrop');
  const baseImg  = document.getElementById('drawBaseImg');
  const canvas   = document.getElementById('drawCanvas');

  baseImg.src = state.img2imgDataUrl;
  modal.classList.add('open');
  backdrop.classList.add('open');

  baseImg.onload = () => { resizeDrawCanvas(); setupCanvasResizeHandles(); };
  if (baseImg.complete) { resizeDrawCanvas(); setupCanvasResizeHandles(); }

  drawState.ctx   = canvas.getContext('2d');
  drawState.lasso = { active:false, points:[], closed:false, floatData:null, floatNatData:null, floatX:0, floatY:0, dragging:false, dragStartX:0, dragStartY:0, floatStartX:0, floatStartY:0, clipboard:null };
  setDrawTool('brush');
  setupDrawEvents(canvas);

  // Keyboard shortcuts while modal is open
  drawState._keyHandler = (e) => {
    if (!modal.classList.contains('open')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (drawState.tool === 'lasso' || drawState.lasso.clipboard) {
      if (e.key === 'c') { e.preventDefault(); lassoCopy(); }
      if (e.key === 'x') { e.preventDefault(); lassoCut();  }
      if (e.key === 'v') { e.preventDefault(); lassoPaste(); }
    }
  };
  document.addEventListener('keydown', drawState._keyHandler);
}

function resizeDrawCanvas() {
  const wrap = document.getElementById('drawCanvasWrap');
  const canvas = document.getElementById('drawCanvas');
  const img = document.getElementById('drawBaseImg');
  const wrapW = wrap.clientWidth;
  const wrapH = wrap.clientHeight;
  const imgW = img.naturalWidth  || wrapW;
  const imgH = img.naturalHeight || wrapH;
  const scale = Math.min(wrapW / imgW, wrapH / imgH, 1);
  const displayW = Math.round(imgW * scale);
  const displayH = Math.round(imgH * scale);
  const offsetX  = Math.round((wrapW - displayW) / 2);
  const offsetY  = Math.round((wrapH - displayH) / 2);

  // Save old canvas data
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = canvas.width; tmpCanvas.height = canvas.height;
  if (canvas.width > 0 && canvas.height > 0) {
    tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);
  }

  const posStyle = (el) => {
    el.style.width  = displayW + 'px';
    el.style.height = displayH + 'px';
    el.style.left   = offsetX  + 'px';
    el.style.top    = offsetY  + 'px';
  };

  canvas.width  = displayW; canvas.height = displayH;
  posStyle(canvas);

  // Lasso canvas — same size, always on top
  const lassoC = document.getElementById('drawLassoCanvas');
  if (lassoC) { lassoC.width = displayW; lassoC.height = displayH; posStyle(lassoC); }

  // Float canvas — same size
  const floatC = document.getElementById('drawFloatCanvas');
  if (floatC) { floatC.width = displayW; floatC.height = displayH; posStyle(floatC); }

  // Match base image
  img.style.position = 'absolute'; img.style.inset = 'unset';
  posStyle(img); img.style.objectFit = 'fill';

  // Restore drawing scaled
  if (tmpCanvas.width > 0 && tmpCanvas.height > 0) {
    drawState.ctx = canvas.getContext('2d');
    drawState.ctx.drawImage(tmpCanvas, 0, 0, displayW, displayH);
  }

  // Update resize handle positions
  updateCanvasResizeHandles(offsetX, offsetY, displayW, displayH);
}

// Stored window-level handlers so we can remove them before re-adding
let _drawMoveHandler = null;
let _drawUpHandler   = null;

function setupDrawEvents(canvas) {
  // Remove any previously attached window-level handlers
  if (_drawMoveHandler) { window.removeEventListener('mousemove', _drawMoveHandler); _drawMoveHandler = null; }
  if (_drawUpHandler)   { window.removeEventListener('mouseup',   _drawUpHandler);   _drawUpHandler   = null; }

  // Remove canvas-level handlers by replacing with a clone — but preserve pixel data first
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  if (canvas.width > 0 && canvas.height > 0) tmp.getContext('2d').drawImage(canvas, 0, 0);
  const newCanvas = canvas.cloneNode(false); // clone attrs/styles only, no children
  // Copy all computed styles that matter for positioning
  newCanvas.style.cssText = canvas.style.cssText;
  canvas.parentNode.replaceChild(newCanvas, canvas);
  // Restore pixel data onto the new canvas
  newCanvas.getContext('2d').drawImage(tmp, 0, 0);
  drawState.ctx = newCanvas.getContext('2d');

  // getPos always reads the rect fresh from the DOM — never stale
  const getPos = (e, target) => {
    const el = target || newCanvas;
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  // Float canvas drag
  const floatC = document.getElementById('drawFloatCanvas');
  if (floatC) {
    // Remove old listener by cloning floatC too
    const newFloat = floatC.cloneNode(false);
    newFloat.style.cssText = floatC.style.cssText;
    floatC.parentNode.replaceChild(newFloat, floatC);
    newFloat.addEventListener('mousedown', e => {
      if (drawState.tool !== 'lasso' || !drawState.lasso.floatData) return;
      e.preventDefault();
      drawState.lasso.dragging = true;
      const pos = getPos(e, newFloat);
      drawState.lasso.dragStartX  = pos.x;
      drawState.lasso.dragStartY  = pos.y;
      drawState.lasso.floatStartX = drawState.lasso.floatX;
      drawState.lasso.floatStartY = drawState.lasso.floatY;
    });
  }

  const startPaint = (e) => {
    e.preventDefault();
    const pos = getPos(e);

    if (drawState.tool === 'eyedrop') {
      pickColorFromImg(e, newCanvas, document.getElementById('drawBaseImg'), hex => {
        drawState.color = hex;
        document.getElementById('drawColor').value = hex;
      });
      return;
    }
    if (drawState.tool === 'fill') {
      floodFill(newCanvas, Math.round(pos.x), Math.round(pos.y), drawState.color);
      return;
    }
    if (drawState.tool === 'lasso') {
      const ls = drawState.lasso;
      if (ls.floatData) {
        if (pos.x < ls.floatX || pos.x > ls.floatX + ls.floatData.width ||
            pos.y < ls.floatY || pos.y > ls.floatY + ls.floatData.height) {
          stampFloat(newCanvas);
        }
        return;
      }
      ls.active = true; ls.closed = false; ls.points = [pos];
      drawLassoOverlay();
      return;
    }
    drawState.painting = true;
    drawState.lastX = pos.x; drawState.lastY = pos.y;
    drawDot(newCanvas, pos.x, pos.y);
  };

  const movePaint = (e) => {
    // Re-read rect every move — always current after any resize
    const pos = getPos(e);
    if (drawState.lasso.dragging) {
      const dx = pos.x - drawState.lasso.dragStartX;
      const dy = pos.y - drawState.lasso.dragStartY;
      drawState.lasso.floatX = drawState.lasso.floatStartX + dx;
      drawState.lasso.floatY = drawState.lasso.floatStartY + dy;
      renderFloat();
      return;
    }
    if (drawState.tool === 'lasso' && drawState.lasso.active && !drawState.lasso.closed) {
      drawState.lasso.points.push(pos);
      drawLassoOverlay();
      return;
    }
    if (!drawState.painting) return;
    drawLine(newCanvas, drawState.lastX, drawState.lastY, pos.x, pos.y);
    drawState.lastX = pos.x; drawState.lastY = pos.y;
  };

  const endPaint = () => {
    if (drawState.lasso.dragging) { drawState.lasso.dragging = false; return; }
    if (drawState.tool === 'lasso' && drawState.lasso.active) {
      drawState.lasso.active = false;
      drawState.lasso.closed = true;
      drawLassoOverlay();
      document.getElementById('lassoActionsGroup').style.display = '';
      return;
    }
    drawState.painting = false;
  };

  const windowMove = (e) => {
    if (drawState.lasso.dragging || drawState.painting ||
        (drawState.tool === 'lasso' && drawState.lasso.active)) {
      movePaint(e);
    }
  };
  const windowUp = () => endPaint();

  newCanvas.addEventListener('mousedown',  startPaint);
  newCanvas.addEventListener('mouseleave', () => { if (!drawState.lasso.dragging) drawState.painting = false; });
  newCanvas.addEventListener('touchstart', startPaint, {passive:false});
  newCanvas.addEventListener('touchmove',  (e) => { e.preventDefault(); movePaint(e); }, {passive:false});
  newCanvas.addEventListener('touchend',   endPaint);

  // Store and attach window-level handlers
  _drawMoveHandler = windowMove;
  _drawUpHandler   = windowUp;
  window.addEventListener('mousemove', _drawMoveHandler);
  window.addEventListener('mouseup',   _drawUpHandler);
}

// ── Tool selector ─────────────────────────────────────────────
function setDrawTool(tool) {
  drawState.tool = tool;
  const ids   = ['drawBrushBtn','drawEraserBtn','drawEyedropBtn','drawFillBtn','drawLassoBtn'];
  const tools = ['brush','eraser','eyedrop','fill','lasso'];
  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tools[i] === tool);
  });
  // Lasso action strip visibility
  const lag = document.getElementById('lassoActionsGroup');
  if (lag) lag.style.display = (tool === 'lasso') ? '' : 'none';

  const canvas = document.getElementById('drawCanvas');
  if (!canvas) return;
  if (tool === 'eyedrop') { canvas.style.cursor = 'crosshair'; return; }
  if (tool === 'fill')    { canvas.style.cursor = 'cell'; return; }
  if (tool === 'lasso')   { canvas.style.cursor = 'crosshair'; return; }
  applyBrushCursor(canvas, drawState.brushSize, tool === 'eraser');
}

// ── Paint Bucket (flood fill) ─────────────────────────────────
function floodFill(canvas, startX, startY, fillColorHex) {
  // Sample color from the COMPOSITE of base image + draw canvas,
  // but write the fill only onto the draw canvas.
  const baseImg = document.getElementById('drawBaseImg');
  const w = canvas.width, h = canvas.height;

  // Build composite read-source
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sCtx = src.getContext('2d');
  sCtx.drawImage(baseImg, 0, 0, w, h);   // base underneath
  sCtx.drawImage(canvas, 0, 0);           // drawing on top
  const srcData = sCtx.getImageData(0, 0, w, h).data;

  // Parse fill color
  const fr = parseInt(fillColorHex.slice(1,3),16);
  const fg = parseInt(fillColorHex.slice(3,5),16);
  const fb = parseInt(fillColorHex.slice(5,7),16);
  const fa = 255;

  const idx = (x, y) => (y * w + x) * 4;
  const si  = idx(startX, startY);
  const tr = srcData[si], tg = srcData[si+1], tb = srcData[si+2], ta = srcData[si+3];

  // Already that color — nothing to do
  if (tr === fr && tg === fg && tb === fb && ta === fa) return;

  const tolerance = 30;
  const matches = (i) =>
    Math.abs(srcData[i]   - tr) <= tolerance &&
    Math.abs(srcData[i+1] - tg) <= tolerance &&
    Math.abs(srcData[i+2] - tb) <= tolerance &&
    Math.abs(srcData[i+3] - ta) <= tolerance;

  // Flood fill — collect all pixels to fill
  const fillMask = new Uint8Array(w * h);
  const stack = [[startX, startY]];
  fillMask[startY * w + startX] = 1;

  while (stack.length) {
    const [x, y] = stack.pop();
    fillMask[y * w + x] = 2; // confirmed fill

    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (fillMask[ni]) continue;
      fillMask[ni] = 1;
      if (matches(idx(nx, ny))) stack.push([nx, ny]);
    }
  }

  // Write fill to draw canvas only
  const drawCtx = canvas.getContext('2d');
  const drawData = drawCtx.getImageData(0, 0, w, h);
  const dd = drawData.data;
  for (let i = 0; i < w * h; i++) {
    if (fillMask[i] === 2) {
      const p = i * 4;
      dd[p] = fr; dd[p+1] = fg; dd[p+2] = fb; dd[p+3] = fa;
    }
  }
  drawCtx.putImageData(drawData, 0, 0);
}

// ── Lasso overlay (marching-ants marquee) ────────────────────
let _lassoAntOffset = 0;
let _lassoAntTimer = null;

function drawLassoOverlay() {
  const c = document.getElementById('drawLassoCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const ls = drawState.lasso;
  if (!ls.points.length) return;

  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 3]);
  ctx.lineDashOffset = -_lassoAntOffset;
  ctx.beginPath();
  ctx.moveTo(ls.points[0].x, ls.points[0].y);
  for (let i = 1; i < ls.points.length; i++) ctx.lineTo(ls.points[i].x, ls.points[i].y);
  if (ls.closed) ctx.closePath();
  ctx.stroke();

  // Dark underline for contrast
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 3]);
  ctx.lineDashOffset = -_lassoAntOffset + 3;
  ctx.beginPath();
  ctx.moveTo(ls.points[0].x, ls.points[0].y);
  for (let i = 1; i < ls.points.length; i++) ctx.lineTo(ls.points[i].x, ls.points[i].y);
  if (ls.closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();

  if (ls.closed && !_lassoAntTimer) {
    _lassoAntTimer = setInterval(() => {
      _lassoAntOffset = (_lassoAntOffset + 1) % 18;
      drawLassoOverlay();
    }, 60);
  }
}

function clearLassoOverlay() {
  const c = document.getElementById('drawLassoCanvas');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  if (_lassoAntTimer) { clearInterval(_lassoAntTimer); _lassoAntTimer = null; }
}

// Build a clipping mask from lasso points (display coords)
function buildLassoClipPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

// Grab pixels within lasso from both base image and draw canvas
function extractLassoSelection(drawCanvas) {
  const ls = drawState.lasso;
  if (!ls.closed || ls.points.length < 3) return null;

  // Bounding box in display coords
  const xs = ls.points.map(p => p.x), ys = ls.points.map(p => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(drawCanvas.width,  Math.ceil(Math.max(...xs)));
  const y1 = Math.min(drawCanvas.height, Math.ceil(Math.max(...ys)));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return null;

  // Composite base + draw into a single canvas
  const baseImg = document.getElementById('drawBaseImg');
  const src = document.createElement('canvas');
  src.width = drawCanvas.width; src.height = drawCanvas.height;
  const sCtx = src.getContext('2d');
  sCtx.drawImage(baseImg, 0, 0, drawCanvas.width, drawCanvas.height);
  sCtx.drawImage(drawCanvas, 0, 0);

  // Clip to lasso shape and extract bounding box
  const out = document.createElement('canvas');
  out.width = bw; out.height = bh;
  const oCtx = out.getContext('2d');
  oCtx.save();
  // Translate so lasso origin aligns with the bounding box
  const shiftedPoints = ls.points.map(p => ({ x: p.x - x0, y: p.y - y0 }));
  oCtx.beginPath();
  oCtx.moveTo(shiftedPoints[0].x, shiftedPoints[0].y);
  for (let i = 1; i < shiftedPoints.length; i++) oCtx.lineTo(shiftedPoints[i].x, shiftedPoints[i].y);
  oCtx.closePath();
  oCtx.clip();
  oCtx.drawImage(src, -x0, -y0);
  oCtx.restore();

  return { canvas: out, x0, y0, bw, bh };
}

// Copy selection to clipboard (internal + native if possible)
function lassoCopy() {
  const canvas = document.getElementById('drawCanvas');
  const result = extractLassoSelection(canvas);
  if (!result) return;
  const { canvas: out, x0, y0 } = result;
  const ctx = out.getContext('2d');
  drawState.lasso.clipboard = { imageData: ctx.getImageData(0, 0, out.width, out.height), w: out.width, h: out.height };
  document.getElementById('lassoPasteBtn').style.display = '';
  showToast('success', 'Copied', 'Selection copied. Use Paste to place it.');
}

// Cut: copy then erase the selected region from the composite (base + draw)
// so no black hole appears — we bake the composite and cut from it.
function lassoCut() {
  const canvas  = document.getElementById('drawCanvas');
  const baseImg = document.getElementById('drawBaseImg');
  const ls = drawState.lasso;
  if (!ls.closed || ls.points.length < 3) return;

  lassoCopy(); // save to clipboard first

  // Bake composite into a single canvas at natural resolution
  const natW = baseImg.naturalWidth, natH = baseImg.naturalHeight;
  const dispW = canvas.width, dispH = canvas.height;

  const composite = document.createElement('canvas');
  composite.width = natW; composite.height = natH;
  const cCtx = composite.getContext('2d');
  cCtx.drawImage(baseImg, 0, 0);
  cCtx.drawImage(canvas, 0, 0, natW, natH);

  // Erase the lasso region from the composite (scale lasso points to natural resolution)
  const scaleX = natW / dispW, scaleY = natH / dispH;
  const natPoints = ls.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
  cCtx.save();
  cCtx.beginPath();
  cCtx.moveTo(natPoints[0].x, natPoints[0].y);
  for (let i = 1; i < natPoints.length; i++) cCtx.lineTo(natPoints[i].x, natPoints[i].y);
  cCtx.closePath();
  cCtx.clip();
  cCtx.globalCompositeOperation = 'destination-out';
  cCtx.fillStyle = 'rgba(0,0,0,1)';
  cCtx.fillRect(0, 0, natW, natH);
  cCtx.restore();

  // Update base image to the new composite (with hole)
  baseImg.src = composite.toDataURL();

  // Clear the draw layer entirely (it's now baked into base)
  const drawCtx = canvas.getContext('2d');
  drawCtx.clearRect(0, 0, dispW, dispH);
  drawState.ctx = drawCtx;

  lassoClear();
}

// Paste clipboard as floating layer in the center
function lassoPaste() {
  const cb = drawState.lasso.clipboard;
  if (!cb) return;
  const canvas = document.getElementById('drawCanvas');
  const floatC = document.getElementById('drawFloatCanvas');
  floatC.style.display = '';

  // Place float in center of canvas
  drawState.lasso.floatX = Math.round((canvas.width  - cb.w) / 2);
  drawState.lasso.floatY = Math.round((canvas.height - cb.h) / 2);

  // Clone the imagedata
  const tmp = document.createElement('canvas');
  tmp.width = cb.w; tmp.height = cb.h;
  tmp.getContext('2d').putImageData(cb.imageData, 0, 0);
  drawState.lasso.floatData = tmp.getContext('2d').getImageData(0, 0, cb.w, cb.h);

  floatC.style.cursor = 'move';
  renderFloat();
}

// Draw the floating layer onto the float canvas
function renderFloat() {
  const floatC = document.getElementById('drawFloatCanvas');
  if (!floatC) return;
  const ctx = floatC.getContext('2d');
  ctx.clearRect(0, 0, floatC.width, floatC.height);
  const ls = drawState.lasso;
  if (!ls.floatData) return;
  const tmp = document.createElement('canvas');
  tmp.width = ls.floatData.width; tmp.height = ls.floatData.height;
  tmp.getContext('2d').putImageData(ls.floatData, 0, 0);
  ctx.drawImage(tmp, ls.floatX, ls.floatY);
  // Dashed border around float
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5,3]);
  ctx.strokeRect(ls.floatX + 0.5, ls.floatY + 0.5, ls.floatData.width - 1, ls.floatData.height - 1);
  ctx.restore();
}

// Stamp float down onto the draw canvas and clear it
function stampFloat(drawCanvas) {
  const ls = drawState.lasso;
  if (!ls.floatData) return;
  const ctx = drawState.ctx || drawCanvas.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = ls.floatData.width; tmp.height = ls.floatData.height;
  tmp.getContext('2d').putImageData(ls.floatData, 0, 0);
  ctx.drawImage(tmp, ls.floatX, ls.floatY);
  ls.floatData = null;
  const floatC = document.getElementById('drawFloatCanvas');
  if (floatC) { floatC.getContext('2d').clearRect(0,0,floatC.width,floatC.height); floatC.style.display='none'; }
}

// Clear/reset lasso
function lassoClear() {
  drawState.lasso.active = false;
  drawState.lasso.closed = false;
  drawState.lasso.points = [];
  stampFloat(document.getElementById('drawCanvas')); // stamp any float first
  clearLassoOverlay();
  document.getElementById('lassoActionsGroup').style.display = 'none';
}

// ── Canvas edge/corner resize handles ─────────────────────────
function updateCanvasResizeHandles(ox, oy, cw, ch) {
  const T = 10; // thickness of the hit/visual strip in px
  const defs = {
    'drh-n': { left: ox,      top: oy - T,      width: cw,  height: T*2 },
    'drh-s': { left: ox,      top: oy + ch - T, width: cw,  height: T*2 },
    'drh-e': { left: ox + cw - T, top: oy,      width: T*2, height: ch  },
    'drh-w': { left: ox - T,  top: oy,          width: T*2, height: ch  },
  };
  const cursors = { n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize' };
  Object.entries(defs).forEach(([id, d]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.left   = d.left   + 'px';
    el.style.top    = d.top    + 'px';
    el.style.width  = d.width  + 'px';
    el.style.height = d.height + 'px';
    el.style.cursor = cursors[id.replace('drh-','')];
  });
}

function setupCanvasResizeHandles() {
  document.querySelectorAll('.canvas-edge-handle').forEach(handle => {
    handle.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dir     = handle.dataset.dir;
      const canvas  = document.getElementById('drawCanvas');
      const baseImg = document.getElementById('drawBaseImg');

      const startX    = e.clientX, startY = e.clientY;
      const origNW    = baseImg.naturalWidth;
      const origNH    = baseImg.naturalHeight;
      const origDispW = canvas.width;
      const origDispH = canvas.height;

      // Snapshot original base image and drawing ONCE at drag start
      const origBaseC = document.createElement('canvas');
      origBaseC.width = origNW; origBaseC.height = origNH;
      origBaseC.getContext('2d').drawImage(baseImg, 0, 0);

      const origDrawC = document.createElement('canvas');
      origDrawC.width = origDispW; origDispH && (origDrawC.height = origDispH);
      origDrawC.getContext('2d').drawImage(canvas, 0, 0);

      // Natural-to-display scale at drag start
      const dispScaleX = origDispW / origNW;
      const dispScaleY = origDispH / origNH;

      let busy = false;

      const onMove = (me) => {
        if (busy) return;
        busy = true;

        const dx = me.clientX - startX;
        const dy = me.clientY - startY;

        let dnatW = 0, dnatH = 0, anchorX = 0, anchorY = 0;
        if (dir === 'e')  dnatW =  Math.round(dx / dispScaleX);
        if (dir === 'w') { dnatW = -Math.round(dx / dispScaleX); anchorX = 1; }
        if (dir === 's')  dnatH =  Math.round(dy / dispScaleY);
        if (dir === 'n') { dnatH = -Math.round(dy / dispScaleY); anchorY = 1; }

        const newNatW = Math.max(64, origNW + dnatW);
        const newNatH = Math.max(64, origNH + dnatH);

        // Where the original image sits inside the new canvas (natural px)
        const offNatX = anchorX ? (newNatW - origNW) : 0;
        const offNatY = anchorY ? (newNatH - origNH) : 0;

        // Build new base: white background + original image at offset
        const tmp = document.createElement('canvas');
        tmp.width = newNatW; tmp.height = newNatH;
        const tCtx = tmp.getContext('2d');
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, newNatW, newNatH);
        tCtx.drawImage(origBaseC, offNatX, offNatY);

        // Set the new base src — do everything in the single onload
        const newSrc = tmp.toDataURL();
        const loader = new Image();
        loader.onload = () => {
          // Swap baseImg src directly (already loaded via loader)
          baseImg.src = newSrc;

          // Compute new display size (same logic as resizeDrawCanvas but inline
          // so we can place the drawing BEFORE resizeDrawCanvas wipes the canvas)
          const wrap   = document.getElementById('drawCanvasWrap');
          const wrapW  = wrap.clientWidth;
          const wrapH  = wrap.clientHeight;
          const scale  = Math.min(wrapW / newNatW, wrapH / newNatH, 1);
          const dispW  = Math.round(newNatW * scale);
          const dispH  = Math.round(newNatH * scale);
          const ox     = Math.round((wrapW - dispW) / 2);
          const oy     = Math.round((wrapH - dispH) / 2);

          // Position all canvases
          const applyPos = (el) => {
            el.style.width  = dispW + 'px'; el.style.height = dispH + 'px';
            el.style.left   = ox   + 'px'; el.style.top    = oy   + 'px';
          };
          canvas.width = dispW; canvas.height = dispH; applyPos(canvas);
          const lassoC = document.getElementById('drawLassoCanvas');
          if (lassoC) { lassoC.width = dispW; lassoC.height = dispH; applyPos(lassoC); }
          const floatC = document.getElementById('drawFloatCanvas');
          if (floatC)  { floatC.width = dispW; floatC.height = dispH; applyPos(floatC); }
          baseImg.style.position = 'absolute'; baseImg.style.inset = 'unset';
          applyPos(baseImg); baseImg.style.objectFit = 'fill';

          // Paint original drawing into correct position on the new (cleared) canvas
          const ctx = canvas.getContext('2d');
          const newScaleX = dispW / newNatW;
          const newScaleY = dispH / newNatH;
          const dispOffX  = Math.round(offNatX * newScaleX);
          const dispOffY  = Math.round(offNatY * newScaleY);
          const origDrawDispW = Math.round(origNW * newScaleX);
          const origDrawDispH = Math.round(origNH * newScaleY);
          ctx.drawImage(origDrawC, dispOffX, dispOffY, origDrawDispW, origDrawDispH);
          drawState.ctx = ctx;

          updateCanvasResizeHandles(ox, oy, dispW, dispH);
          // Update resolution display live so user sees the new dimensions
          state.resW = newNatW; state.resH = newNatH; updateResDisplay();
          busy = false;
        };
        loader.src = newSrc;
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        // Re-wire draw events after drag completes — canvas is stable now
        setupDrawEvents(document.getElementById('drawCanvas'));
        setupCanvasResizeHandles();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
  });
}

function drawDot(canvas, x, y) {
  const ctx = drawState.ctx || canvas.getContext('2d');
  ctx.save();
  if (drawState.isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = drawState.color;
  }
  ctx.beginPath();
  ctx.arc(x, y, drawState.brushSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLine(canvas, x1, y1, x2, y2) {
  const ctx = drawState.ctx || canvas.getContext('2d');
  ctx.save();
  if (drawState.isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = drawState.color;
  }
  ctx.lineWidth = drawState.brushSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ── Brush cursor ──────────────────────────────────────────────────────────────
// Generates a circular cursor matching the actual brush size and applies it
// to the canvas element. Eraser gets a dashed outline; brush gets a filled dot.
function applyBrushCursor(canvas, brushSize, isEraser, gridSnap = false) {
  if (!canvas) return;
  const r = Math.max(2, brushSize / 2);

  if (gridSnap) {
    // ── Grid Snap cursor: square(s) aligned to the 8px VAE grid ────────────
    // The cursor should show approximately how many grid cells the brush covers.
    // Each grid cell is 8px in image space, but we're in display space here,
    // so we just use the brush diameter as the square side length for a faithful
    // preview, snapped to multiples of 8 for visual honesty.
    const CELL = 8;
    // Side length: round brushSize to nearest multiple of CELL, minimum 1 cell
    const rawSide = Math.max(CELL, Math.round(brushSize / CELL) * CELL);
    const padding = 3;
    const dim = rawSide + padding * 2 + 2; // a little breathing room
    const c = document.createElement('canvas');
    c.width = dim; c.height = dim;
    const ctx = c.getContext('2d');
    const x0 = padding + 0.5; // +0.5 for crisp 1px stroke
    const y0 = padding + 0.5;
    const side = rawSide - 1; // inset so stroke doesn't clip

    if (isEraser) {
      // Dashed square outline — eraser variant
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x0, y0, side, side);
      // Inner dark square for contrast
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x0 + 1, y0 + 1, side - 2, side - 2);
    } else {
      // Filled semi-transparent square + white outline (brush variant)
      ctx.fillStyle = 'rgba(80,140,255,0.25)';
      ctx.fillRect(x0, y0, side, side);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(x0, y0, side, side);
      // Draw interior grid lines to show individual 8px cells when large enough
      if (rawSide >= CELL * 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        for (let g = CELL; g < rawSide; g += CELL) {
          // Vertical grid line
          ctx.beginPath();
          ctx.moveTo(x0 + g, y0);
          ctx.lineTo(x0 + g, y0 + side);
          ctx.stroke();
          // Horizontal grid line
          ctx.beginPath();
          ctx.moveTo(x0,        y0 + g);
          ctx.lineTo(x0 + side, y0 + g);
          ctx.stroke();
        }
      }
    }
    // Center dot
    const cx = dim / 2;
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(cx - 1, cx - 1, 2, 2);
    canvas.style.cursor = `url(${c.toDataURL()}) ${cx} ${cx}, crosshair`;

  } else {
    // ── Normal circular cursor (original behaviour) ─────────────────────────
    const dim = Math.max(6, Math.ceil(r * 2) + 4);
    const cx = dim / 2;
    const c = document.createElement('canvas');
    c.width = dim; c.height = dim;
    const ctx = c.getContext('2d');
    if (isEraser) {
      // Dashed circle outline for eraser
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(cx, cx, r - 1, 0, Math.PI * 2); ctx.stroke();
      // Inner dark ring for contrast
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cx, r - 2, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Filled semi-transparent circle + white outline
      ctx.beginPath(); ctx.arc(cx, cx, r - 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(80,140,255,0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Crosshair dot in center
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(cx - 1, cx - 1, 2, 2);
    canvas.style.cursor = `url(${c.toDataURL()}) ${cx} ${cx}, crosshair`;
  }
}

function updateDrawBrushSize(val) {
  drawState.brushSize = parseInt(val);
  document.getElementById('drawBrushSizeVal').textContent = val;
  applyBrushCursor(document.getElementById('drawCanvas'), drawState.brushSize, drawState.tool === 'eraser');
}

function updateDrawColor(val) {
  drawState.color = val;
  if (drawState.tool === 'eraser') setDrawTool('brush');
  document.getElementById('drawEraserBtn').classList.remove('active');
  applyBrushCursor(document.getElementById('drawCanvas'), drawState.brushSize, false);
}

function toggleDrawEraser() { setDrawTool(drawState.tool === 'eraser' ? 'brush' : 'eraser'); }
function toggleDrawEyedrop() { setDrawTool(drawState.tool === 'eyedrop' ? 'brush' : 'eyedrop'); }

function pickColorFromImg(e, canvas, imgEl, callback) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  // Scale to natural image size
  const scaleX = imgEl.naturalWidth / rect.width;
  const scaleY = imgEl.naturalHeight / rect.height;
  const tmpC = document.createElement('canvas');
  tmpC.width = imgEl.naturalWidth; tmpC.height = imgEl.naturalHeight;
  const tmpCtx = tmpC.getContext('2d');
  try {
    tmpCtx.drawImage(imgEl, 0, 0);
    const px = tmpCtx.getImageData(Math.floor(x * scaleX), Math.floor(y * scaleY), 1, 1).data;
    const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2,'0')).join('');
    callback(hex);
  } catch(err) {
    console.warn('Eyedrop pick failed (CORS?):', err);
  }
}

function clearDraw() {
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function saveDrawAndClose() {
  // Stamp any floating selection down first
  const drawCanvas = document.getElementById('drawCanvas');
  if (drawState.lasso.floatData) stampFloat(drawCanvas);
  lassoClear();

  const baseImg = document.getElementById('drawBaseImg');

  // Merge: draw base image then overlay canvas onto a composite at natural resolution
  const composite = document.createElement('canvas');
  composite.width  = baseImg.naturalWidth;
  composite.height = baseImg.naturalHeight;
  const cCtx = composite.getContext('2d');
  cCtx.drawImage(baseImg, 0, 0);
  cCtx.drawImage(drawCanvas, 0, 0, composite.width, composite.height);

  composite.toBlob(blob => {
    const file = new File([blob], 'drawn.png', {type:'image/png'});
    const dataUrl = URL.createObjectURL(blob);
    setImg2Img(file, dataUrl);
    closeDrawModal();
  }, 'image/png');
}

function closeDrawModal() {
  clearLassoOverlay();
  if (drawState.lasso.floatData) stampFloat(document.getElementById('drawCanvas'));
  if (drawState._keyHandler) { document.removeEventListener('keydown', drawState._keyHandler); drawState._keyHandler = null; }
  if (_drawMoveHandler) { window.removeEventListener('mousemove', _drawMoveHandler); _drawMoveHandler = null; }
  if (_drawUpHandler)   { window.removeEventListener('mouseup',   _drawUpHandler);   _drawUpHandler   = null; }
  document.getElementById('drawModal').classList.remove('open');
  document.getElementById('drawModalBackdrop').classList.remove('open');
}

// ─────────────────────────────────────────────
// INPAINT MASK MENU
// ─────────────────────────────────────────────
const inpaintState = {
  isEraser: false,
  painting: false,
  brushSize: 20,
  ctx: null,
  lastX: 0, lastY: 0,
  gridSnap: false,  // when true: brush paints hard 8×8 latent-grid-aligned blocks
};

function openInpaintMenu() {
  if (!state.img2imgDataUrl) return;
  const modal = document.getElementById('inpaintModal');
  const backdrop = document.getElementById('inpaintModalBackdrop');
  // Always paint over the original unmasked image so re-editing works cleanly
  const srcUrl = state.inpaintOrigDataUrl || state.img2imgDataUrl;
  const baseImg = document.getElementById('inpaintBaseImg');
  const canvas = document.getElementById('inpaintMaskCanvas');

  baseImg.src = srcUrl;
  modal.classList.add('open');
  backdrop.classList.add('open');

  baseImg.onload = () => resizeInpaintCanvas();
  if (baseImg.complete && baseImg.naturalWidth) resizeInpaintCanvas();

  inpaintState.isEraser = false;
  document.getElementById('inpaintEraserBtn').classList.remove('active');
  // Sync grid snap button to current state (persists across open/close)
  document.getElementById('inpaintGridSnapBtn').classList.toggle('active', inpaintState.gridSnap);
  // Apply brush cursor
  applyBrushCursor(document.getElementById('inpaintMaskCanvas'), inpaintState.brushSize, false, inpaintState.gridSnap);

  setupInpaintEvents(canvas);
}

function resizeInpaintCanvas() {
  const wrap = document.getElementById('inpaintCanvasWrap');
  const canvas = document.getElementById('inpaintMaskCanvas');
  const img = document.getElementById('inpaintBaseImg');
  const wrapW = wrap.clientWidth;
  const wrapH = wrap.clientHeight;
  const imgW = img.naturalWidth || wrapW;
  const imgH = img.naturalHeight || wrapH;
  const scale = Math.min(wrapW / imgW, wrapH / imgH, 1);
  const displayW = Math.round(imgW * scale);
  const displayH = Math.round(imgH * scale);
  const offsetX = Math.round((wrapW - displayW) / 2);
  const offsetY = Math.round((wrapH - displayH) / 2);

  // Save existing mask drawing
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = canvas.width; tmpCanvas.height = canvas.height;
  if (canvas.width > 0) tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);

  canvas.width = displayW; canvas.height = displayH;
  canvas.style.width  = displayW + 'px';
  canvas.style.height = displayH + 'px';
  canvas.style.left   = offsetX + 'px';
  canvas.style.top    = offsetY + 'px';

  // Match base image position/size exactly to the canvas so they align pixel-perfect
  img.style.position = 'absolute';
  img.style.inset    = 'unset';
  img.style.width    = displayW + 'px';
  img.style.height   = displayH + 'px';
  img.style.left     = offsetX + 'px';
  img.style.top      = offsetY + 'px';
  img.style.objectFit = 'fill'; // already sized correctly, no letterbox needed

  inpaintState.ctx = canvas.getContext('2d');
  // Restore previous mask if dimensions match
  if (tmpCanvas.width > 0) {
    inpaintState.ctx.drawImage(tmpCanvas, 0, 0, displayW, displayH);
  }
}

function setupInpaintEvents(canvas) {
  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);
  inpaintState.ctx = newCanvas.getContext('2d');
  // Restore any existing mask drawing
  if (canvas.width > 0 && canvas.height > 0) {
    inpaintState.ctx.drawImage(canvas, 0, 0);
  }

  const getPos = (e) => {
    const rect = newCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startPaint = (e) => {
    e.preventDefault();
    inpaintState.painting = true;
    const pos = getPos(e);
    inpaintState.lastX = pos.x; inpaintState.lastY = pos.y;
    paintMaskDot(newCanvas, pos.x, pos.y);
  };
  const movePaint = (e) => {
    e.preventDefault();
    if (!inpaintState.painting) return;
    const pos = getPos(e);
    paintMaskLine(newCanvas, inpaintState.lastX, inpaintState.lastY, pos.x, pos.y);
    inpaintState.lastX = pos.x; inpaintState.lastY = pos.y;
  };
  const endPaint = () => { inpaintState.painting = false; };

  newCanvas.addEventListener('mousedown', startPaint);
  newCanvas.addEventListener('mousemove', movePaint);
  newCanvas.addEventListener('mouseup', endPaint);
  newCanvas.addEventListener('mouseleave', endPaint);
  newCanvas.addEventListener('touchstart', startPaint, {passive:false});
  newCanvas.addEventListener('touchmove', movePaint, {passive:false});
  newCanvas.addEventListener('touchend', endPaint);
}

// ── Grid-snap helpers ────────────────────────────────────────────────────────
// The canvas is displayed at a scaled size but the underlying mask bitmap is
// at the original image's pixel dimensions (set in resizeInpaintCanvas).
// We need to know the display→pixel scale to snap brush positions to the
// 8×8 VAE latent grid in *image* space, then paint back in *display* space.

function getCanvasDisplayScale(canvas) {
  // canvas.width/height = actual pixel dims; getBoundingClientRect = display dims
  const rect = canvas.getBoundingClientRect();
  return {
    scaleX: canvas.width  / (rect.width  || 1),
    scaleY: canvas.height / (rect.height || 1),
  };
}

// Given a display-space coordinate and brush radius, return an array of
// 8×8 grid-aligned rectangles (in display space) that the brush covers.
function gridCellsForBrush(canvas, cx, cy, brushRadius) {
  const GRID = 8;
  const { scaleX, scaleY } = getCanvasDisplayScale(canvas);

  // Convert brush center + radius to image pixel space
  const imgCX = cx * scaleX;
  const imgCY = cy * scaleY;
  const imgR  = brushRadius * Math.max(scaleX, scaleY);

  // Find which 8×8 cells the circle overlaps in image space
  const cellMinX = Math.floor((imgCX - imgR) / GRID);
  const cellMinY = Math.floor((imgCY - imgR) / GRID);
  const cellMaxX = Math.floor((imgCX + imgR) / GRID);
  const cellMaxY = Math.floor((imgCY + imgR) / GRID);

  const cells = [];
  for (let gy = cellMinY; gy <= cellMaxY; gy++) {
    for (let gx = cellMinX; gx <= cellMaxX; gx++) {
      // Cell center in image space
      const ccx = (gx + 0.5) * GRID;
      const ccy = (gy + 0.5) * GRID;
      // Only include if circle overlaps cell (distance to center < radius + half-cell)
      const dx = Math.max(0, Math.abs(imgCX - ccx) - GRID / 2);
      const dy = Math.max(0, Math.abs(imgCY - ccy) - GRID / 2);
      if (Math.sqrt(dx * dx + dy * dy) <= imgR) {
        // Convert back to display space for rendering
        cells.push({
          x: (gx * GRID) / scaleX,
          y: (gy * GRID) / scaleY,
          w: GRID / scaleX,
          h: GRID / scaleY,
        });
      }
    }
  }
  return cells;
}

function paintMaskDot(canvas, x, y) {
  const ctx = inpaintState.ctx || canvas.getContext('2d');
  ctx.save();
  if (inpaintState.isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(80,140,255,0.85)';
  }

  if (inpaintState.gridSnap) {
    const cells = gridCellsForBrush(canvas, x, y, inpaintState.brushSize / 2);
    for (const c of cells) ctx.fillRect(c.x, c.y, c.w, c.h);
  } else {
    ctx.beginPath();
    ctx.arc(x, y, inpaintState.brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintMaskLine(canvas, x1, y1, x2, y2) {
  const ctx = inpaintState.ctx || canvas.getContext('2d');

  if (inpaintState.gridSnap) {
    // Interpolate along the stroke and stamp grid cells at each step
    ctx.save();
    if (inpaintState.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(80,140,255,0.85)';
    }
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const stepSize = Math.max(2, inpaintState.brushSize / 4);
    const steps = Math.max(1, Math.ceil(dist / stepSize));
    // Track painted cells this stroke to avoid redundant fillRects
    const painted = new Set();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mx = x1 + dx * t;
      const my = y1 + dy * t;
      const cells = gridCellsForBrush(canvas, mx, my, inpaintState.brushSize / 2);
      for (const c of cells) {
        const key = `${c.x},${c.y}`;
        if (!painted.has(key)) {
          painted.add(key);
          ctx.fillRect(c.x, c.y, c.w, c.h);
        }
      }
    }
    ctx.restore();
  } else {
    ctx.save();
    if (inpaintState.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(80,140,255,0.85)';
    }
    ctx.lineWidth = inpaintState.brushSize;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
}

function toggleGridSnap() {
  inpaintState.gridSnap = !inpaintState.gridSnap;
  document.getElementById('inpaintGridSnapBtn').classList.toggle('active', inpaintState.gridSnap);
  applyBrushCursor(document.getElementById('inpaintMaskCanvas'), inpaintState.brushSize, inpaintState.isEraser, inpaintState.gridSnap);
}

function updateInpaintBrushSize(val) {
  inpaintState.brushSize = parseInt(val);
  document.getElementById('inpaintBrushSizeVal').textContent = val;
  applyBrushCursor(document.getElementById('inpaintMaskCanvas'), inpaintState.brushSize, inpaintState.isEraser, inpaintState.gridSnap);
}

function toggleInpaintEraser() {
  inpaintState.isEraser = !inpaintState.isEraser;
  document.getElementById('inpaintEraserBtn').classList.toggle('active', inpaintState.isEraser);
  applyBrushCursor(document.getElementById('inpaintMaskCanvas'), inpaintState.brushSize, inpaintState.isEraser, inpaintState.gridSnap);
}

function clearInpaintMask() {
  const canvas = document.getElementById('inpaintMaskCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Build a white-on-black mask blob from the blue overlay canvas
async function buildMaskBlob(maskCanvas) {
  const baseImg = document.getElementById('inpaintBaseImg');
  const naturalW = baseImg.naturalWidth;
  const naturalH = baseImg.naturalHeight;
  const out = document.createElement('canvas');
  out.width = naturalW; out.height = naturalH;
  const ctx = out.getContext('2d');
  // Scale the display-size mask canvas up to the image's native resolution
  const scaled = document.createElement('canvas');
  scaled.width = naturalW; scaled.height = naturalH;
  scaled.getContext('2d').drawImage(maskCanvas, 0, 0, naturalW, naturalH);
  const data = scaled.getContext('2d').getImageData(0, 0, naturalW, naturalH);
  const outData = ctx.createImageData(naturalW, naturalH);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = data.data[i + 3] > 10 ? 255 : 0;
    outData.data[i] = v; outData.data[i+1] = v; outData.data[i+2] = v; outData.data[i+3] = 255;
  }
  ctx.putImageData(outData, 0, 0);
  return new Promise(res => out.toBlob(res, 'image/png'));
}

// Build a preview: original image with blue mask overlay composited on top
async function buildMaskPreviewDataUrl(maskCanvas) {
  const baseImg = document.getElementById('inpaintBaseImg');
  const W = baseImg.naturalWidth, H = baseImg.naturalHeight;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.drawImage(baseImg, 0, 0, W, H);
  // Draw the mask overlay (blue tint) scaled to native size
  ctx.globalAlpha = 0.5;
  ctx.drawImage(maskCanvas, 0, 0, W, H);
  ctx.globalAlpha = 1;
  return out.toDataURL('image/png');
}

// "Save Mask & Close" — commit mask, show preview in img2img strip, reveal inpaint controls
async function saveInpaintMaskAndClose() {
  const canvas = document.getElementById('inpaintMaskCanvas');

  // Check mask is non-empty
  const ctx = canvas.getContext('2d');
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let hasPixels = false;
  for (let i = 3; i < d.length; i += 4) { if (d[i] > 10) { hasPixels = true; break; } }
  if (!hasPixels) {
    closeInpaintModal();
    return;
  }

  // Preserve original image before any masking
  if (!state.inpaintOrigDataUrl) {
    state.inpaintOrigDataUrl = state.img2imgDataUrl;
    state.inpaintOrigFile    = state.img2imgFile;
  }

  // Build mask blob (white-on-black for ComfyUI)
  state.inpaintMaskBlob = await buildMaskBlob(canvas);

  // Build preview (original + blue overlay) to show in the strip
  const previewUrl = await buildMaskPreviewDataUrl(canvas);
  document.getElementById('img2imgPreview').src = previewUrl;

  closeInpaintModal();
  updateInpaintControlsVisibility();
}

function closeInpaintModal() {
  document.getElementById('inpaintModal').classList.remove('open');
  document.getElementById('inpaintModalBackdrop').classList.remove('open');
}

// Clear the active mask and restore the original image preview
function clearActiveMask() {
  state.inpaintMaskBlob = null;
  // Restore original preview
  if (state.inpaintOrigDataUrl) {
    document.getElementById('img2imgPreview').src = state.inpaintOrigDataUrl;
    state.img2imgDataUrl = state.inpaintOrigDataUrl;
    state.img2imgFile    = state.inpaintOrigFile;
    state.inpaintOrigDataUrl = null;
    state.inpaintOrigFile    = null;
  }
  // Clear the mask canvas too
  clearInpaintMask();
  updateInpaintControlsVisibility();
}

function updateInpaintControlsVisibility() {
  const hasMask = !!(state.inpaintEnabled && state.inpaintMaskBlob);
  const controls = document.getElementById('inpaintControls');
  if (controls) controls.style.display = hasMask ? 'block' : 'none';
}

// ─────────────────────────────────────────────
// INPAINT WORKFLOW — hooked into generate()
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// FOCUSED INPAINTING (NovelAI-style)
// Pipeline:
//   1. JS: compute mask bounding box on the raw mask canvas/blob
//   2. JS: expand bbox by contextPct padding → padded crop rect (snapped to 8px)
//   3. JS: crop source image + mask to that rect using OffscreenCanvas
//   4. JS: upscale crop to workingRes (long-edge)
//   5. ComfyUI: VAEEncode + SetLatentNoiseMask (binary mask) + KSampler
//   6. JS: downscale result back to crop dimensions
//   7. JS: composite back into original full image using feathered mask
// ─────────────────────────────────────────────────────────────────────────────

// ── Helper: toggle Full Image mode UI ──────────────────────────────────────
function onFullImageToggle() {
  const full = document.getElementById('inpaintFullImageToggle')?.checked;
  const focEl  = document.getElementById('focusedInpaintControls');
  const fullEl = document.getElementById('fullImageInpaintControls');
  if (focEl)  focEl.style.display  = full ? 'none'  : '';
  if (fullEl) fullEl.style.display = full ? '' : 'none';
}

// ── Helper: get bounding box of non-transparent pixels in ImageData ─────────
function getMaskBoundingBox(imageData) {
  const { data, width, height } = imageData;
  let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]; // alpha channel
      if (a > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        found = true;
      }
    }
  }
  if (!found) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ── Helper: snap a crop rect to the 8px VAE latent grid ────────────────────
function snapToLatentGrid(rect, imgW, imgH) {
  const GRID = 8;
  let x = Math.floor(rect.x / GRID) * GRID;
  let y = Math.floor(rect.y / GRID) * GRID;
  let x2 = Math.ceil((rect.x + rect.w) / GRID) * GRID;
  let y2 = Math.ceil((rect.y + rect.h) / GRID) * GRID;
  x  = Math.max(0, x);
  y  = Math.max(0, y);
  x2 = Math.min(imgW, x2);
  y2 = Math.min(imgH, y2);
  return { x, y, w: x2 - x, h: y2 - y };
}

// ── Helper: crop an ImageBitmap to a rect and return a Blob ────────────────
async function cropImageBitmapToBlob(bitmap, rect) {
  const oc = new OffscreenCanvas(rect.w, rect.h);
  const ctx = oc.getContext('2d');
  ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return oc.convertToBlob({ type: 'image/png' });
}

// ── Helper: scale an ImageBitmap to target dimensions and return a Blob ─────
async function scaleBitmapToBlob(bitmap, targetW, targetH) {
  const oc = new OffscreenCanvas(targetW, targetH);
  const ctx = oc.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  return oc.convertToBlob({ type: 'image/png' });
}

// ── Helper: composite inpainted crop back into full original image ──────────
// Returns a Blob of the composited full-size image.
async function compositeInpaintResult(origDataUrl, resultBitmap, cropRect, featherPx) {
  // Draw original
  const origBlob = await (await fetch(origDataUrl)).blob();
  const origBitmap = await createImageBitmap(origBlob);

  const oc = new OffscreenCanvas(origBitmap.width, origBitmap.height);
  const ctx = oc.getContext('2d');

  // 1. Draw original
  ctx.drawImage(origBitmap, 0, 0);

  // 2. The result bitmap is at the inpainted-crop scale, so we need to
  //    scale it back to the cropRect dimensions in the original space
  const scaledW = cropRect.w;
  const scaledH = cropRect.h;

  // Create a temporary canvas for the scaled-down result
  const tmpOc = new OffscreenCanvas(scaledW, scaledH);
  const tmpCtx = tmpOc.getContext('2d');
  tmpCtx.imageSmoothingEnabled = true;
  tmpCtx.imageSmoothingQuality = 'high';
  tmpCtx.drawImage(resultBitmap, 0, 0, scaledW, scaledH);

  if (featherPx <= 0) {
    // Hard composite: just draw result at crop position
    ctx.drawImage(tmpOc, cropRect.x, cropRect.y);
  } else {
    // Feathered composite using a radial-feathered mask drawn into the crop area
    // We draw a feathered mask on a small canvas, use it as clip, then draw result
    const maskOc = new OffscreenCanvas(scaledW, scaledH);
    const maskCtx = maskOc.getContext('2d');
    // Black base (transparent for composite)
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, scaledW, scaledH);
    // White solid center with feathered edge
    const grd = maskCtx.createLinearGradient(0, 0, featherPx, 0); // placeholder for edge
    // Use a box with gaussian-like feathering via shadowBlur trick
    maskCtx.shadowColor = 'white';
    maskCtx.shadowBlur  = featherPx * 2;
    maskCtx.fillStyle   = 'white';
    const inset = Math.max(1, featherPx);
    maskCtx.fillRect(inset, inset, scaledW - inset * 2, scaledH - inset * 2);

    // Now composite: draw result in a temp, mask it, paste to main
    const composOc = new OffscreenCanvas(scaledW, scaledH);
    const composCtx = composOc.getContext('2d');
    composCtx.drawImage(tmpOc, 0, 0);
    composCtx.globalCompositeOperation = 'destination-in';
    composCtx.drawImage(maskOc, 0, 0);

    ctx.drawImage(composOc, cropRect.x, cropRect.y);
  }

  return oc.convertToBlob({ type: 'image/png' });
}

// ── Helper: compute working resolution keeping aspect ratio ────────────────
function computeWorkingSize(cropW, cropH, targetLongEdge) {
  const GRID = 8;
  let w, h;
  if (cropW >= cropH) {
    w = targetLongEdge;
    h = Math.round((cropH / cropW) * targetLongEdge);
  } else {
    h = targetLongEdge;
    w = Math.round((cropW / cropH) * targetLongEdge);
  }
  // Snap to 8px for VAE compatibility
  w = Math.round(w / GRID) * GRID;
  h = Math.round(h / GRID) * GRID;
  return { w: Math.max(GRID, w), h: Math.max(GRID, h) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch: if a mask is active, route generate() to generateInpaint()
// ─────────────────────────────────────────────────────────────────────────────

async function generateInpaint() {
  if (state.generating) return;
  if (state.marblesEnabled) {
    const cost = MARBLE_COSTS[state.resCategory] || 5;
    if (state.marbles < cost) { alert(`Not enough marbles! Need ${cost}, have ${state.marbles}.`); return; }
  }

  const useFullImage = document.getElementById('inpaintFullImageToggle')?.checked || false;

  // Route to legacy full-image mode if toggled
  if (useFullImage) {
    return generateInpaintFullImage();
  }

  state.generating = true;
  const btn = document.getElementById('generateBtn');
  btn.classList.add('loading');
  document.getElementById('genBtnText').textContent = 'Inpainting…';
  showGenOverlay(true);
  document.getElementById('genOverlayText').textContent = 'Focused Inpainting…';
  clearProgress();
  addPendingHistoryItem(1);

  try {
    // ── Read parameters ──────────────────────────────────────────────────────
    const denoise      = parseFloat(document.getElementById('inpaintDenoiseNum')?.value) || 0.85;
    const featherPx    = parseInt(document.getElementById('inpaintMaskBlurNum')?.value) || 8;
    const maskMode     = document.getElementById('inpaintMaskMode')?.value || 'masked';
    const contextPct   = (parseInt(document.getElementById('inpaintContextSlider2')?.value) || 10) / 100;
    const workingRes   = parseInt(document.getElementById('inpaintWorkingRes')?.value) || 1024;
    const positive     = buildPositivePrompt();
    const negative     = buildNegativePrompt();
    const sampler      = document.getElementById('samplerName').value;
    const scheduler    = document.getElementById('scheduler').value;
    const steps        = parseInt(document.getElementById('stepsNum').value) || 20;
    const cfg          = parseFloat(document.getElementById('cfgNum').value) || 7;
    const vaeRaw       = document.getElementById('vaeSelect').value;
    const te           = document.getElementById('teSelect')?.value ?? 'none';
    const teType       = document.getElementById('teType')?.value ?? 'stable_diffusion';

    let seed = parseInt(document.getElementById('seedInput').value);
    if (seed === -1 || !state.seedLocked) {
      seed = Math.floor(Math.random() * 2**32);
      if (!state.seedLocked) document.getElementById('seedInput').value = seed;
    }

    // ── Step 1-3: Bounding box → padded crop rect ────────────────────────────
    document.getElementById('genOverlayText').textContent = 'Computing crop region…';

    const origUrl  = state.inpaintOrigDataUrl || state.img2imgDataUrl;
    const origBlob = await (await fetch(origUrl)).blob();
    const origBitmap = await createImageBitmap(origBlob);
    const imgW = origBitmap.width;
    const imgH = origBitmap.height;

    // Get the mask blob and find bounding box
    const maskBlob   = state.inpaintMaskBlob;
    const maskBitmap = await createImageBitmap(maskBlob);

    // Read mask pixels at native image dimensions (mask may be at display scale → rescale)
    const maskOc = new OffscreenCanvas(imgW, imgH);
    const maskCtx2 = maskOc.getContext('2d');
    maskCtx2.drawImage(maskBitmap, 0, 0, imgW, imgH);
    const maskData = maskCtx2.getImageData(0, 0, imgW, imgH);

    const bbox = getMaskBoundingBox(maskData);
    if (!bbox) throw new Error('Mask is empty — paint a mask first.');

    // Expand bbox by context padding
    const padX = Math.round(bbox.w * contextPct);
    const padY = Math.round(bbox.h * contextPct);
    const rawCrop = {
      x: bbox.x - padX,
      y: bbox.y - padY,
      w: bbox.w + padX * 2,
      h: bbox.h + padY * 2,
    };
    // Snap to 8px latent grid and clamp to image bounds
    const cropRect = snapToLatentGrid(rawCrop, imgW, imgH);

    // ── Step 4: Crop source image and mask, upscale to working resolution ────
    document.getElementById('genOverlayText').textContent = 'Preparing crop…';

    const { w: workW, h: workH } = computeWorkingSize(cropRect.w, cropRect.h, workingRes);

    // Crop + scale source image
    const croppedImgBlob  = await cropImageBitmapToBlob(origBitmap, cropRect);
    const croppedImgBmap  = await createImageBitmap(croppedImgBlob);
    const scaledImgBlob   = await scaleBitmapToBlob(croppedImgBmap, workW, workH);

    // Crop + scale mask (BINARY — no feathering at this stage)
    const croppedMaskBlob = await cropImageBitmapToBlob(maskBitmap, cropRect);
    const croppedMaskBmap = await createImageBitmap(croppedMaskBlob);
    const scaledMaskBlob  = await scaleBitmapToBlob(croppedMaskBmap, workW, workH);

    // ── Step 5: Upload to ComfyUI and run inpainting ─────────────────────────
    document.getElementById('genOverlayText').textContent = 'Uploading to ComfyUI…';

    const imgFile = new File([scaledImgBlob], 'fi_src.png', { type: 'image/png' });
    const imgFd   = new FormData(); imgFd.append('image', imgFile, imgFile.name);
    const imgUp   = await comfyFetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: imgFd });
    if (!imgUp.ok) throw new Error('Image upload failed');
    const { name: imgName } = await imgUp.json();

    const maskFile = new File([scaledMaskBlob], 'fi_mask.png', { type: 'image/png' });
    const maskFd   = new FormData(); maskFd.append('image', maskFile, maskFile.name);
    const maskUp   = await comfyFetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: maskFd });
    if (!maskUp.ok) throw new Error('Mask upload failed');
    const { name: maskName } = await maskUp.json();

    // ── Build ComfyUI workflow ───────────────────────────────────────────────
    const nodes = {};
    let nid = 1;
    const id = () => String(nid++);
    let modelSrc, clipSrc, vaeSrc;

    // Load model
    if (state.modelType === 'checkpoint') {
      const ckptId = id();
      nodes[ckptId] = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: document.getElementById('checkpointSelect').value } };
      modelSrc = [ckptId, 0]; clipSrc = [ckptId, 1]; vaeSrc = [ckptId, 2];
    } else {
      const unetId = id();
      nodes[unetId] = { class_type: 'UNETLoader', inputs: { unet_name: document.getElementById('diffusionSelect').value, weight_dtype: 'default' } };
      modelSrc = [unetId, 0]; vaeSrc = null;
      if (te && te !== 'none') {
        const clipId = id();
        nodes[clipId] = { class_type: 'CLIPLoader', inputs: { clip_name: te, type: teType } };
        clipSrc = [clipId, 0];
      }
    }

    if (vaeRaw && !vaeRaw.startsWith('Automatic')) {
      const vaeId = id();
      nodes[vaeId] = { class_type: 'VAELoader', inputs: { vae_name: vaeRaw } };
      vaeSrc = [vaeId, 0];
    }

    if (state.vPrediction) {
      const vpId = id();
      nodes[vpId] = { class_type: 'ModelSamplingDiscrete', inputs: { model: modelSrc, sampling: 'v_prediction', zsnr: true } };
      modelSrc = [vpId, 0];
    }
    if (state.rescaleCFGEnabled) {
      const rcId = id();
      nodes[rcId] = { class_type: 'RescaleCFG', inputs: { model: modelSrc, multiplier: parseFloat(document.getElementById('rescaleCFGNum').value) } };
      modelSrc = [rcId, 0];
    }
    getActiveLoRAs().forEach(lora => {
      const loraId = id();
      nodes[loraId] = { class_type: 'LoraLoader', inputs: { model: modelSrc, clip: clipSrc, lora_name: lora.name, strength_model: lora.strength, strength_clip: lora.strength } };
      modelSrc = [loraId, 0]; clipSrc = [loraId, 1];
    });

    // Load cropped+scaled image and mask
    const loadImgId = id();
    nodes[loadImgId] = { class_type: 'LoadImage', inputs: { image: imgName, upload: 'image' } };

    const loadMaskId = id();
    nodes[loadMaskId] = { class_type: 'LoadImage', inputs: { image: maskName, upload: 'image' } };
    const imgToMaskId = id();
    nodes[imgToMaskId] = { class_type: 'ImageToMask', inputs: { image: [loadMaskId, 0], channel: 'red' } };

    // Binary mask — no blur/grow here. Feathering is done during JS compositing.
    let maskSrc = [imgToMaskId, 0];

    // Invert if user wants to inpaint the unmasked area
    if (maskMode === 'unmasked') {
      const invId = id();
      nodes[invId] = { class_type: 'InvertMask', inputs: { mask: maskSrc } };
      maskSrc = [invId, 0];
    }

    // Encode cropped image → latent, apply binary noise mask
    const resolvedVae = vaeSrc || [Object.keys(nodes)[0], 2];
    const vaeEncId = id();
    nodes[vaeEncId] = { class_type: 'VAEEncode', inputs: { pixels: [loadImgId, 0], vae: resolvedVae } };
    const setMaskId = id();
    nodes[setMaskId] = { class_type: 'SetLatentNoiseMask', inputs: { samples: [vaeEncId, 0], mask: maskSrc } };

    // Text encode
    const posId = id();
    nodes[posId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: positive } };
    const negId = id();
    nodes[negId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: negative } };

    // KSampler
    const ksId = id();
    nodes[ksId] = {
      class_type: 'KSampler',
      inputs: {
        model: modelSrc, positive: [posId, 0], negative: [negId, 0],
        latent_image: [setMaskId, 0],
        seed, steps, cfg, sampler_name: sampler, scheduler, denoise,
      }
    };

    // Decode
    const decId = id();
    nodes[decId] = { class_type: 'VAEDecode', inputs: { samples: [ksId, 0], vae: resolvedVae } };

    // Save (intermediate — we'll composite in JS after)
    const saveId = id();
    nodes[saveId] = { class_type: 'SaveImage', inputs: { images: [decId, 0], filename_prefix: 'ComfyStudio_FI_Crop' } };

    document.getElementById('genOverlayText').textContent = 'Inpainting crop…';
    state.lastGenMeta = captureGenMeta(seed);

    const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: nodes, client_id: state.clientId })
    });
    if (!res.ok) throw new Error(await res.text());
    const { prompt_id } = await res.json();
    state.lastPromptId = prompt_id;

    // ── Step 6-7: Poll, then composite result back into original ─────────────
    // We intercept image delivery by polling manually and doing JS compositing
    document.getElementById('genOverlayText').textContent = 'Compositing result…';

    // Use a special flag so pollForImages knows to composite instead of direct display
    state._focusedInpaintParams = { origUrl, cropRect, featherPx };
    await pollForImages(prompt_id, 1);
    // _focusedInpaintParams cleared inside the composite handler

    deductMarbles(MARBLE_COSTS[state.resCategory] || 5);

  } catch (e) {
    showGenOverlay(false);
    resetBtn();
    showGenOverlay(false);
    clearProgress();
    resetBtn();
    showToast('error', 'Focused Inpaint Failed', e.message || String(e));
    console.error(e);
  }
}

// ── Legacy full-image inpainting (retained as fallback) ───────────────────
async function generateInpaintFullImage() {
  state.generating = true;
  const btn = document.getElementById('generateBtn');
  btn.classList.add('loading');
  document.getElementById('genBtnText').textContent = 'Inpainting…';
  showGenOverlay(true);
  document.getElementById('genOverlayText').textContent = 'Inpainting (full image)…';
  clearProgress();
  addPendingHistoryItem(1);

  try {
    const origUrl = state.inpaintOrigDataUrl || state.img2imgDataUrl;
    const imgBlob = await (await fetch(origUrl)).blob();
    const imgFile = new File([imgBlob], 'inpaint_src.png', {type:'image/png'});
    const imgFd = new FormData(); imgFd.append('image', imgFile, imgFile.name);
    const imgUp = await comfyFetch(`${state.comfyUrl}/upload/image`, {method:'POST', body:imgFd});
    if (!imgUp.ok) throw new Error('Image upload failed');
    const {name: imgName} = await imgUp.json();

    const maskFile = new File([state.inpaintMaskBlob], 'inpaint_mask.png', {type:'image/png'});
    const maskFd = new FormData(); maskFd.append('image', maskFile, maskFile.name);
    const maskUp = await comfyFetch(`${state.comfyUrl}/upload/image`, {method:'POST', body:maskFd});
    if (!maskUp.ok) throw new Error('Mask upload failed');
    const {name: maskName} = await maskUp.json();

    const denoise   = parseFloat(document.getElementById('inpaintDenoiseNum')?.value) || 0.85;
    const maskBlur  = parseInt(document.getElementById('inpaintMaskBlurFullNum')?.value) || 4;
    const maskMode  = document.getElementById('inpaintMaskModeFullImage')?.value || 'masked';
    const positive  = buildPositivePrompt();
    const negative  = buildNegativePrompt();
    const vaeRaw    = document.getElementById('vaeSelect').value;
    const sampler   = document.getElementById('samplerName').value;
    const scheduler = document.getElementById('scheduler').value;
    const steps     = parseInt(document.getElementById('stepsNum').value) || 20;
    const cfg       = parseFloat(document.getElementById('cfgNum').value) || 7;
    const te        = document.getElementById('teSelect')?.value ?? 'none';
    const teType    = document.getElementById('teType')?.value ?? 'stable_diffusion';

    let seed = parseInt(document.getElementById('seedInput').value);
    if (seed === -1 || !state.seedLocked) {
      seed = Math.floor(Math.random() * 2**32);
      if (!state.seedLocked) document.getElementById('seedInput').value = seed;
    }

    const nodes = {};
    let nid = 1; const id = () => String(nid++);
    let modelSrc, clipSrc, vaeSrc;

    if (state.modelType === 'checkpoint') {
      const ckptId = id();
      nodes[ckptId] = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: document.getElementById('checkpointSelect').value } };
      modelSrc = [ckptId, 0]; clipSrc = [ckptId, 1]; vaeSrc = [ckptId, 2];
    } else {
      const unetId = id();
      nodes[unetId] = { class_type: 'UNETLoader', inputs: { unet_name: document.getElementById('diffusionSelect').value, weight_dtype: 'default' } };
      modelSrc = [unetId, 0]; vaeSrc = null;
      if (te && te !== 'none') {
        const clipId = id();
        nodes[clipId] = { class_type: 'CLIPLoader', inputs: { clip_name: te, type: teType } };
        clipSrc = [clipId, 0];
      }
    }

    if (vaeRaw && !vaeRaw.startsWith('Automatic')) {
      const vaeId = id();
      nodes[vaeId] = { class_type: 'VAELoader', inputs: { vae_name: vaeRaw } };
      vaeSrc = [vaeId, 0];
    }

    if (state.vPrediction) {
      const vpId = id();
      nodes[vpId] = { class_type: 'ModelSamplingDiscrete', inputs: { model: modelSrc, sampling: 'v_prediction', zsnr: true } };
      modelSrc = [vpId, 0];
    }
    if (state.rescaleCFGEnabled) {
      const rcId = id();
      nodes[rcId] = { class_type: 'RescaleCFG', inputs: { model: modelSrc, multiplier: parseFloat(document.getElementById('rescaleCFGNum').value) } };
      modelSrc = [rcId, 0];
    }
    getActiveLoRAs().forEach(lora => {
      const loraId = id();
      nodes[loraId] = { class_type: 'LoraLoader', inputs: { model: modelSrc, clip: clipSrc, lora_name: lora.name, strength_model: lora.strength, strength_clip: lora.strength } };
      modelSrc = [loraId, 0]; clipSrc = [loraId, 1];
    });

    const loadImgId = id();
    nodes[loadImgId] = { class_type: 'LoadImage', inputs: { image: imgName, upload: 'image' } };
    const loadMaskId = id();
    nodes[loadMaskId] = { class_type: 'LoadImage', inputs: { image: maskName, upload: 'image' } };
    const imgToMaskId = id();
    nodes[imgToMaskId] = { class_type: 'ImageToMask', inputs: { image: [loadMaskId, 0], channel: 'red' } };

    let maskSrc = [imgToMaskId, 0];
    if (maskBlur > 0) {
      const growId = id();
      nodes[growId] = { class_type: 'GrowMask', inputs: { mask: maskSrc, expand: maskBlur, tapered_corners: true } };
      maskSrc = [growId, 0];
    }
    if (maskMode === 'unmasked') {
      const invId = id();
      nodes[invId] = { class_type: 'InvertMask', inputs: { mask: maskSrc } };
      maskSrc = [invId, 0];
    }

    const vaeEncId = id();
    nodes[vaeEncId] = { class_type: 'VAEEncode', inputs: { pixels: [loadImgId, 0], vae: vaeSrc } };
    const setMaskId = id();
    nodes[setMaskId] = { class_type: 'SetLatentNoiseMask', inputs: { samples: [vaeEncId, 0], mask: maskSrc } };

    const posId = id(); nodes[posId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: positive } };
    const negId = id(); nodes[negId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: negative } };

    const ksId = id();
    nodes[ksId] = { class_type: 'KSampler', inputs: {
      model: modelSrc, positive: [posId, 0], negative: [negId, 0],
      latent_image: [setMaskId, 0], seed, steps, cfg, sampler_name: sampler, scheduler, denoise,
    }};

    const decId = id(); nodes[decId] = { class_type: 'VAEDecode', inputs: { samples: [ksId, 0], vae: vaeSrc } };
    const saveId = id(); nodes[saveId] = { class_type: 'SaveImage', inputs: { images: [decId, 0], filename_prefix: 'ComfyStudio_Inpaint' } };

    state.lastGenMeta = captureGenMeta(seed);
    state._wasInpaintResult = true;
    const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prompt: nodes, client_id: state.clientId })
    });
    if (!res.ok) throw new Error(await res.text());
    const {prompt_id} = await res.json();
    state.lastPromptId = prompt_id;
    await pollForImages(prompt_id, 1);
    deductMarbles(MARBLE_COSTS[state.resCategory] || 5);
  } catch(e) {
    showGenOverlay(false);
    clearProgress();
    resetBtn();
    showToast('error', 'Inpaint Failed', e.message || String(e));
  }
}

// ─────────────────────────────────────────────
// RESTORE INPAINT SETTING ON LOAD
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inpaint toggle restore
  const savedInpaint = localStorage.getItem('comfyStudioInpaint') === 'true';
  if (savedInpaint) {
    state.inpaintEnabled = true;
    const tog = document.getElementById('inpaintToggle');
    if (tog) tog.checked = true;
  }

  // IP Adapter restore
  const savedIPA = localStorage.getItem('comfyStudioIPA') === 'true';
  if (savedIPA) {
    state.ipAdapterEnabled = true;
    const tog = document.getElementById('ipAdapterToggle');
    if (tog) tog.checked = true;
    const card = document.getElementById('ipAdapterCard');
    if (card) card.style.display = '';
  }

  // ControlNet restore
  const savedCN = localStorage.getItem('comfyStudioCN') === 'true';
  if (savedCN) {
    state.controlNetEnabled = true;
    const tog = document.getElementById('controlNetToggle');
    if (tog) tog.checked = true;
    const card = document.getElementById('controlNetCard');
    if (card) card.style.display = '';
  }
});

// Show/hide inpaint button when img2img state changes
function updateInpaintBtnVisibility() {
  const btn = document.getElementById('inpaintLaunchBtn');
  if (btn) btn.style.display = (state.inpaintEnabled && state.img2imgDataUrl) ? 'block' : 'none';
}

// ═════════════════════════════════════════════════════════════
// COMPARISON GRID  (v4)
// ═════════════════════════════════════════════════════════════

const cg = {
  slots:   [],
  running: false,
  nextId:  1,
  open:    false,
  sendAll: false,
  mode:    'slots',  // 'slots' | 'xyz'
  sharedSeed: false,
  sharedSeedVal: -1,

  // XYZ state
  xyz: {
    x: { type: 'sampler',   values: [], selectedList: [] },
    y: { type: 'none',      values: [], selectedList: [] },
    z: { type: 'none',      values: [], selectedList: [] },
  },
};
const CG_MAX = 12;

// ── Default slot ──────────────────────────────────────────────
function cgDefaultSlot() {
  const rawPrompt = document.getElementById('positivePrompt')?.value || '';
  const rawNeg    = document.getElementById('negativePrompt')?.value  || '';
  return {
    id:         cg.nextId++,
    label:      '',
    prompt:     cgApplyPrepend(rawPrompt),
    neg:        cgApplyNegPrepend(rawNeg),
    sampler:    document.getElementById('samplerName')?.value     || 'euler_ancestral',
    scheduler:  document.getElementById('scheduler')?.value       || 'karras',
    steps:      document.getElementById('stepsNum')?.value        || '28',
    cfg:        document.getElementById('cfgNum')?.value          || '7',
    denoise:    document.getElementById('denoiseNum')?.value      || '1',
    seed:       '-1',
    useModel:   false,
    modelType:  'checkpoint',
    modelName:  '',
    loras:      [],
    chars:      [],
    resultUrl:  null,
    status:     'idle',
    collapsed:  false,
  };
}

// Build a prompt string with prepend tags applied if enabled
function cgApplyPrepend(raw) {
  if (state.qualityTagsEnabled && state.qualityTagsText.trim()) {
    const qt = state.qualityTagsText.trim().replace(/,\s*$/, '');
    return qt + (raw.trim() ? ', ' + raw : '');
  }
  return raw;
}
function cgApplyNegPrepend(raw) {
  if (state.negQualityTagsEnabled && state.negQualityTagsText.trim()) {
    const qt = state.negQualityTagsText.trim().replace(/,\s*$/, '');
    return qt + (raw.trim() ? ', ' + raw : '');
  }
  return raw;
}

// Update the active prompt banner
function cgUpdatePromptBanner() {
  const rawPrompt = document.getElementById('positivePrompt')?.value || '';
  const hasPrepend = state.qualityTagsEnabled && state.qualityTagsText.trim();
  const fullPrompt = cgApplyPrepend(rawPrompt);
  const banner  = document.getElementById('cgPromptBannerText');
  const badge   = document.getElementById('cgPrependBadge');
  if (banner) banner.textContent = fullPrompt.trim() || '(empty)';
  if (badge)  badge.style.display = hasPrepend ? '' : 'none';
}

// ── Open / close ──────────────────────────────────────────────
function toggleCompGridPanel() {
  cg.open = !cg.open;
  const shell = document.getElementById('cgShell');
  shell.style.display = cg.open ? 'flex' : 'none';
  const btn = document.getElementById('actionCompGridBtn');
  if (btn) btn.classList.toggle('active', cg.open);
  if (cg.open) {
    if (cg.slots.length === 0) { cgAddSlot(); cgAddSlot(); }
    // Sync sendAll checkbox
    const chk = document.getElementById('cgSendAll');
    if (chk) chk.checked = cg.sendAll;
    cgUpdatePromptBanner();
    cgSetMode(cg.mode || 'slots');
    cgRender();
    cgXYZInit();
    cgInitDrag();
  }
}

// ── Drag-resize left panel ────────────────────────────────────
function cgInitDrag() {
  const handle = document.getElementById('cgDragHandle');
  const left   = document.querySelector('.cg-left-panel');
  if (!handle || !left || handle._init) return;
  handle._init = true;
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = left.getBoundingClientRect().width;
    handle.classList.add('active');
    const move = ev => {
      const w = Math.max(260, Math.min(startW + ev.clientX - startX, window.innerWidth * 0.7));
      left.style.width = w + 'px';
    };
    const up = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  });
}

// ── Mode switching ────────────────────────────────────────────
function cgSetMode(mode) {
  cg.mode = mode;
  document.getElementById('cgModeSlots').classList.toggle('active', mode === 'slots');
  document.getElementById('cgModeXYZ').classList.toggle('active', mode === 'xyz');
  document.getElementById('cgSlotsPane').style.display = mode === 'slots' ? 'flex' : 'none';
  document.getElementById('cgXYZPane').style.display   = mode === 'xyz'   ? 'flex' : 'none';
  if (mode === 'xyz') cgXYZRenderAll();
}

// ── Shared seed toggle (slots mode) ──────────────────────────
function cgToggleSharedSeed(enabled) {
  cg.sharedSeed = enabled;
  if (enabled) {
    const seedEl = document.getElementById('cg-seed-' + (cg.slots[0]?.id));
    cg.sharedSeedVal = seedEl ? parseInt(seedEl.value) : Math.floor(Math.random() * 2**32);
    // Sync all slot seeds to the shared value
    cg.slots.forEach(s => {
      const el = document.getElementById(`cg-seed-${s.id}`);
      if (el) { el.value = cg.sharedSeedVal; el.disabled = true; }
    });
  } else {
    cg.slots.forEach(s => {
      const el = document.getElementById(`cg-seed-${s.id}`);
      if (el) el.disabled = false;
    });
  }
}


function cgReadDOM() {
  cg.slots.forEach(s => {
    const v   = id => document.getElementById(id)?.value ?? '';
    s.label     = v(`cg-label-${s.id}`);
    s.prompt    = v(`cg-pos-${s.id}`);
    s.neg       = v(`cg-neg-${s.id}`);
    s.sampler   = v(`cg-sampler-${s.id}`);
    s.scheduler = v(`cg-sched-${s.id}`);
    s.steps     = v(`cg-steps-${s.id}`);
    s.cfg       = v(`cg-cfg-${s.id}`);
    s.denoise   = v(`cg-denoise-${s.id}`);
    s.seed      = v(`cg-seed-${s.id}`);
    const mTog  = document.getElementById(`cg-muse-${s.id}`);
    const mType = document.getElementById(`cg-mtype-${s.id}`);
    const mName = document.getElementById(`cg-mname-${s.id}`);
    if (mTog)  s.useModel  = mTog.checked;
    if (mType) s.modelType = mType.value;
    if (mName) s.modelName = mName.value;
    s.loras = [];
    document.querySelectorAll(`.cg-lora-row[data-sid="${s.id}"]`).forEach(r => {
      const name = r.querySelector('.cg-lora-name')?.value || '';
      const str  = r.querySelector('.cg-lora-str')?.value  || '1';
      if (name) s.loras.push({ name, strength: str });
    });
    s.chars = [];
    document.querySelectorAll(`.cg-char-row[data-sid="${s.id}"]`).forEach(r => {
      s.chars.push({
        kw:     r.querySelector('.cg-char-kw')?.value || '',
        prompt: r.querySelector('.cg-char-ta')?.value || '',
      });
    });
  });
}

// ── CRUD ──────────────────────────────────────────────────────
function cgAddSlot() {
  if (cg.slots.length >= CG_MAX) return;
  cg.slots.push(cgDefaultSlot());
  cgRender();
}
function cgRemoveSlot(id) {
  cgReadDOM();
  cg.slots = cg.slots.filter(s => s.id !== id);
  cgRender();
}
function cgMoveSlot(id, dir) {
  cgReadDOM();
  const i = cg.slots.findIndex(s => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= cg.slots.length) return;
  [cg.slots[i], cg.slots[j]] = [cg.slots[j], cg.slots[i]];
  cgRender();
}
function cgToggleCollapse(id) {
  cgReadDOM();
  const s = cg.slots.find(s => s.id === id);
  if (s) s.collapsed = !s.collapsed;
  cgRender();
}
function cgAddChar(sid) {
  cgReadDOM();
  const s = cg.slots.find(s => s.id === sid);
  if (s) s.chars.push({ kw: '', prompt: '' });
  cgRender();
}
function cgRemoveChar(sid, ci) {
  cgReadDOM();
  const s = cg.slots.find(s => s.id === sid);
  if (s) s.chars.splice(ci, 1);
  cgRender();
}
function cgMoveChar(sid, ci, dir) {
  cgReadDOM();
  const s = cg.slots.find(s => s.id === sid);
  if (!s) return;
  const j = ci + dir;
  if (j < 0 || j >= s.chars.length) return;
  [s.chars[ci], s.chars[j]] = [s.chars[j], s.chars[ci]];
  cgRender();
}
function cgAddLora(sid) {
  cgReadDOM();
  const s = cg.slots.find(s => s.id === sid);
  if (s) s.loras.push({ name: '', strength: '1' });
  cgRender();
}
function cgRemoveLora(sid, li) {
  cgReadDOM();
  const s = cg.slots.find(s => s.id === sid);
  if (s) s.loras.splice(li, 1);
  cgRender();
}
function cgSyncModelType(sid) {
  cgReadDOM();
  const s = cg.slots.find(s => s.id === sid);
  if (s) s.modelName = '';
  cgRender();
}
function cgToggleModelOverride(sid, checked) {
  const wrap = document.getElementById(`cg-model-wrap-${sid}`);
  if (wrap) wrap.style.display = checked ? '' : 'none';
  const s = cg.slots.find(s => s.id === sid);
  if (s) s.useModel = checked;
}

// ── Render slot list ──────────────────────────────────────────
function cgRender() {
  const container = document.getElementById('cgSlots');
  if (!container) return;

  const samplerOpts = ['euler','euler_cfg_pp','euler_ancestral','euler_ancestral_cfg_pp',
    'heun','heunpp2','exp_heun_2_x0','exp_heun_2_x0_sde','dpm_2','dpm_2_ancestral','lms',
    'dpm_fast','dpm_adaptive','dpmpp_2s_ancestral','dpmpp_2s_ancestral_cfg_pp',
    'dpmpp_sde','dpmpp_sde_gpu','dpmpp_2m','dpmpp_2m_cfg_pp','dpmpp_2m_sde','dpmpp_2m_sde_gpu',
    'dpmpp_2m_sde_heun','dpmpp_2m_sde_heun_gpu','dpmpp_3m_sde','dpmpp_3m_sde_gpu',
    'ddpm','lcm','ipndm','ipndm_v','deis',
    'res_multistep','res_multistep_cfg-pp','res_multistep_ancestral','res_multistep_ancestral_cfg-pp',
    'gradient_estimation','gradient_estimation_cfg_pp','er_sde','seeds_2','seeds_3',
    'sa_solver','sa_solver_pece','ddim','uni_pc','uni_pc_bh2']
    .map(v => `<option value="${v}">${v}</option>`).join('');
  const schedOpts = ['simple','sgm_uniform','karras','exponential','ddim_uniform','beta','normal','kl_optimal']
    .map(v => `<option value="${v}">${v}</option>`).join('');
  const checkpoints = Array.from(document.getElementById('checkpointSelect')?.options || []).map(o => o.value).filter(Boolean);
  const diffusions  = Array.from(document.getElementById('diffusionSelect')?.options  || []).map(o => o.value).filter(Boolean);
  const loraList    = state.availableLoras || [];

  container.innerHTML = '';

  cg.slots.forEach((s, i) => {
    const statusTxt = { running: '⟳ generating…', done: '✓', error: '⚠ error' }[s.status] || '';

    const charsHTML = s.chars.map((c, ci) => `
      <div class="cg-char-row" data-sid="${s.id}">
        <div class="cg-reorder-btns">
          <button class="cg-reorder-btn" onclick="cgMoveChar(${s.id},${ci},-1)" ${ci===0?'disabled':''}>▲</button>
          <button class="cg-reorder-btn" onclick="cgMoveChar(${s.id},${ci},1)"  ${ci===s.chars.length-1?'disabled':''}>▼</button>
        </div>
        <input  class="cg-char-kw" placeholder="keyword" value="${cgE(c.kw)}" />
        <textarea class="cg-char-ta" rows="2" placeholder="Character appearance…">${cgE(c.prompt)}</textarea>
        <button class="cg-char-del" onclick="cgRemoveChar(${s.id},${ci})">✕</button>
      </div>`).join('');

    const lorasHTML = s.loras.map((l, li) => `
      <div class="cg-lora-row" data-sid="${s.id}">
        <select class="cg-lora-name">
          <option value="">— select LoRA —</option>
          ${loraList.map(n => `<option value="${cgE(n)}"${n===l.name?' selected':''}>${cgE(n)}</option>`).join('')}
        </select>
        <input class="cg-lora-str num-input" type="number" min="-2" max="2" step="0.05"
               value="${cgE(l.strength)}" style="width:54px" title="Strength" />
        <button class="cg-char-del" onclick="cgRemoveLora(${s.id},${li})">✕</button>
      </div>`).join('');

    const ckOpts  = checkpoints.map(n => `<option value="${cgE(n)}"${n===s.modelName?' selected':''}>${cgE(n)}</option>`).join('');
    const difOpts = diffusions.map(n  => `<option value="${cgE(n)}"${n===s.modelName?' selected':''}>${cgE(n)}</option>`).join('');

    const el = document.createElement('div');
    el.className = 'cg-slot' + (s.collapsed ? ' collapsed' : '');
    el.innerHTML = `
      <div class="cg-slot-header" onclick="cgToggleCollapse(${s.id})">
        <div class="cg-reorder-btns" onclick="event.stopPropagation()">
          <button class="cg-reorder-btn" onclick="cgMoveSlot(${s.id},-1)" ${i===0?'disabled':''}>▲</button>
          <button class="cg-reorder-btn" onclick="cgMoveSlot(${s.id},1)"  ${i===cg.slots.length-1?'disabled':''}>▼</button>
        </div>
        <span class="cg-slot-num">Slot ${i+1}${s.label?' — '+cgE(s.label):''}</span>
        ${s.resultUrl?`<img class="cg-slot-preview visible" src="${s.resultUrl}" />`:''}
        <span class="cg-slot-status">${statusTxt}</span>
        <span class="cg-slot-chevron" style="margin-left:auto">▾</span>
        <button class="cg-slot-del" onclick="event.stopPropagation();cgRemoveSlot(${s.id})"
          ${cg.running?'disabled':''}>✕</button>
      </div>
      <div class="cg-slot-body">
        <div>
          <label class="field-label">Label <span style="font-weight:400;text-transform:none;opacity:.55;letter-spacing:0">(shown above image — blank = no label)</span></label>
          <input type="text" id="cg-label-${s.id}" class="cg-ta"
            style="min-height:0;height:auto;padding:4px 7px;resize:none"
            placeholder="e.g. Blue hair, High CFG, No LoRA…" value="${cgE(s.label)}" />
        </div>
        <div>
          <label class="field-label">Positive Prompt</label>
          <textarea class="cg-ta" id="cg-pos-${s.id}" rows="3">${cgE(s.prompt)}</textarea>
        </div>
        <div>
          <label class="field-label">Negative Prompt</label>
          <textarea class="cg-ta" id="cg-neg-${s.id}" rows="2">${cgE(s.neg)}</textarea>
        </div>
        <div class="cg-row">
          <div class="cg-field"><label class="field-label">Sampler</label>
            <select id="cg-sampler-${s.id}">${samplerOpts}</select></div>
          <div class="cg-field"><label class="field-label">Scheduler</label>
            <select id="cg-sched-${s.id}">${schedOpts}</select></div>
          <div class="cg-field"><label class="field-label">Steps</label>
            <input type="number" id="cg-steps-${s.id}" min="1" max="150" value="${cgE(s.steps)}" /></div>
          <div class="cg-field"><label class="field-label">CFG</label>
            <input type="number" id="cg-cfg-${s.id}" min="1" max="30" step="0.5" value="${cgE(s.cfg)}" /></div>
          <div class="cg-field"><label class="field-label">Denoise</label>
            <input type="number" id="cg-denoise-${s.id}" min="0" max="1" step="0.01" value="${cgE(s.denoise)}" /></div>
          <div class="cg-field"><label class="field-label">Seed</label>
            <input type="number" id="cg-seed-${s.id}" min="-1" value="${cgE(s.seed)}" style="width:84px" /></div>
        </div>
        <div>
          <label class="cg-opt-label" style="margin-bottom:5px">
            <input type="checkbox" id="cg-muse-${s.id}" ${s.useModel?'checked':''}
              onchange="cgToggleModelOverride(${s.id},this.checked)" />
            Override model for this slot
          </label>
          <div class="cg-model-wrap" id="cg-model-wrap-${s.id}" style="${s.useModel?'':'display:none'}">
            <div class="cg-row" style="gap:5px">
              <div class="cg-field"><label class="field-label">Type</label>
                <select id="cg-mtype-${s.id}" onchange="cgSyncModelType(${s.id})">
                  <option value="checkpoint"${s.modelType==='checkpoint'?' selected':''}>Checkpoint</option>
                  <option value="diffusion"${s.modelType==='diffusion'?' selected':''}>Diffusion</option>
                </select></div>
              <div class="cg-field" style="flex:1"><label class="field-label">Model</label>
                <select id="cg-mname-${s.id}" style="width:100%">
                  ${s.modelType==='checkpoint'?ckOpts:difOpts}
                </select></div>
            </div>
          </div>
        </div>
        <div>
          <label class="field-label">LoRAs</label>
          <div class="cg-lora-list">${lorasHTML}</div>
          <button class="cg-add-char-btn" onclick="cgAddLora(${s.id})">＋ Add LoRA</button>
        </div>
        <div>
          <label class="field-label">Characters</label>
          <div class="cg-chars">${charsHTML}</div>
          <button class="cg-add-char-btn" onclick="cgAddChar(${s.id})">＋ Add Character</button>
        </div>
      </div>`;

    container.appendChild(el);
    const sampEl = el.querySelector(`#cg-sampler-${s.id}`);
    const schedEl = el.querySelector(`#cg-sched-${s.id}`);
    if (sampEl)  sampEl.value  = s.sampler;
    if (schedEl) schedEl.value = s.scheduler;
  });

  const addBtn = document.getElementById('cgAddBtn');
  const runBtn = document.getElementById('cgRunBtn');
  const hint   = document.getElementById('cgHint');
  if (addBtn) addBtn.disabled = cg.slots.length >= CG_MAX || cg.running;
  if (runBtn) runBtn.disabled = cg.running || cg.slots.length < 2;
  if (hint) hint.textContent = cg.slots.length < 2
    ? 'Add at least 2 slots to build a comparison grid.'
    : `${cg.slots.length} slot${cg.slots.length > 1 ? 's' : ''} ready.`;

  // Wire up highlight and autocomplete for newly created prompt textareas
  cgSetupSlotPrompts();
}

// ── Wire highlight + autocomplete for CG slot prompts ─────────
function cgSetupSlotPrompts() {
  cg.slots.forEach(s => {
    const posTA = document.getElementById(`cg-pos-${s.id}`);
    const negTA = document.getElementById(`cg-neg-${s.id}`);
    [posTA, negTA].forEach(ta => {
      if (!ta || ta._cgWired) return;
      ta._cgWired = true;

      // ── Highlight overlay ──────────────────────────────────────
      // Wrap the textarea in a relative container with a highlight layer
      // if not already wrapped.
      let highlightLayer = ta.previousElementSibling;
      if (!highlightLayer || !highlightLayer.classList.contains('cg-highlight-layer')) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;';
        ta.parentNode.insertBefore(wrap, ta);
        wrap.appendChild(ta);
        highlightLayer = document.createElement('div');
        highlightLayer.className = 'prompt-highlight-layer cg-highlight-layer';
        highlightLayer.setAttribute('aria-hidden', 'true');
        wrap.insertBefore(highlightLayer, ta);
      }

      function updateHL() {
        if (!state.modifierHighlightEnabled) { highlightLayer.innerHTML = ''; return; }
        const text = ta.value;
        const escaped = escapeHTMLPreserveStructure(text);
        highlightLayer.innerHTML = escaped;
        const cs = getComputedStyle(ta);
        highlightLayer.style.fontSize    = cs.fontSize;
        highlightLayer.style.lineHeight  = cs.lineHeight;
        highlightLayer.style.fontFamily  = cs.fontFamily;
        highlightLayer.style.letterSpacing = cs.letterSpacing;
        highlightLayer.style.wordSpacing   = cs.wordSpacing;
        highlightLayer.style.width = ta.clientWidth + 'px';
        highlightLayer.scrollTop  = ta.scrollTop;
        highlightLayer.scrollLeft = ta.scrollLeft;
      }
      ta.addEventListener('input',  updateHL);
      ta.addEventListener('scroll', () => { highlightLayer.scrollTop = ta.scrollTop; });
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(updateHL).observe(ta);
      }
      updateHL();

      // ── Autocomplete ───────────────────────────────────────────
      if (!state.autocompleteData.length) return;
      let dropdown = null;

      function cgShowAC(matches) {
        cgHideAC();
        if (!matches.length) return;
        dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-list';
        matches.forEach((m, i) => {
          const item = document.createElement('div');
          item.className = 'autocomplete-item' + (i === 0 ? ' active' : '');
          item.textContent = m;
          item.addEventListener('mousedown', e => { e.preventDefault(); cgAcceptTag(m); cgHideAC(); });
          dropdown.appendChild(item);
        });
        const rect = ta.getBoundingClientRect();
        dropdown.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom+2}px;width:${rect.width}px;z-index:9999`;
        document.body.appendChild(dropdown);
      }
      function cgHideAC() { if (dropdown) { dropdown.remove(); dropdown = null; } }
      function cgSetActive(items, idx) { items.forEach((it,i) => it.classList.toggle('active', i===idx)); }
      function cgAcceptTag(tag) {
        const cur = getTagAtCursor(ta);
        if (!cur) return;
        let finalTag = tag;
        if (state.acReplaceUnderscores) finalTag = finalTag.replace(/_/g, ' ');
        if (state.acEscapeParens) finalTag = finalTag.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const start = ta.selectionStart - cur.length;
        ta.value = ta.value.slice(0, start) + finalTag + ta.value.slice(ta.selectionStart);
        ta.selectionStart = ta.selectionEnd = start + finalTag.length;
        updateHL();
      }

      const onACInput = () => {
        if (!state.autocompleteData.length) return;
        const cur = getTagAtCursor(ta);
        if (!cur || cur.length < 2) { cgHideAC(); return; }
        const matches = state.autocompleteData.filter(t => t.toLowerCase().startsWith(cur.toLowerCase())).slice(0, 8);
        if (!matches.length) { cgHideAC(); return; }
        cgShowAC(matches);
      };
      const onACKeydown = e => {
        if (!dropdown) return;
        const items = dropdown.querySelectorAll('.autocomplete-item');
        const active = dropdown.querySelector('.autocomplete-item.active');
        let idx = [...items].indexOf(active);
        if (e.key === 'ArrowDown')  { e.preventDefault(); cgSetActive(items, Math.min(idx+1, items.length-1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); cgSetActive(items, Math.max(idx-1, 0)); }
        else if (e.key === 'Enter' || e.key === 'Tab') {
          const a = dropdown.querySelector('.autocomplete-item.active');
          if (a) { e.preventDefault(); cgAcceptTag(a.textContent); cgHideAC(); }
        } else if (e.key === 'Escape') cgHideAC();
      };
      const onACBlur = () => setTimeout(cgHideAC, 150);
      ta.addEventListener('input',   onACInput);
      ta.addEventListener('keydown', onACKeydown);
      ta.addEventListener('blur',    onACBlur);
      _acHandlers.push([ta,'input',onACInput],[ta,'keydown',onACKeydown],[ta,'blur',onACBlur]);
    });
  });
}

// ── Run ───────────────────────────────────────────────────────
async function cgRun() {
  cgReadDOM();
  if (cg.slots.length < 2) {
    showToast('error', 'Not enough slots', 'Add at least 2 slots first.');
    return;
  }
  if (cg.running) return;

  // Snapshot options BEFORE cgRender wipes/rebuilds anything
  cg.sendAll = document.getElementById('cgSendAll')?.checked ?? cg.sendAll;

  // Apply shared seed if enabled
  if (cg.sharedSeed) {
    const sharedSeedVal = cg.sharedSeedVal > 0 ? cg.sharedSeedVal : Math.floor(Math.random() * 2**32);
    cg.slots.forEach(s => { s.seed = String(sharedSeedVal); });
  }

  cg.running = true;
  cg.slots.forEach(s => { s.resultUrl = null; s.status = 'idle'; s.collapsed = false; });
  cgRender();

  const total = cg.slots.length;

  for (let i = 0; i < total; i++) {
    const s = cg.slots[i];
    s.status = 'running';
    cgSetProgress(i, total, `Generating slot ${i+1} of ${total}…`);
    cgRender();
    try {
      s.resultUrl = await cgGenerateSlot(s);
      s.status    = 'done';
      s.collapsed = true;
      cgShowPreview(s.resultUrl, `Slot ${i+1}${s.label ? ' — ' + s.label : ''}`);
      if (cg.sendAll) {
        addToHistory(s.resultUrl, {
          positivePrompt: s.prompt || s.label || `Comparison Slot ${i+1}`,
          negativePrompt: s.neg,
          generatedAt:    new Date().toISOString(),
        });
      }
    } catch(e) {
      console.error('CG slot error:', e);
      s.status = 'error';
    }
    cgRender();
  }

  cg.running = false;
  const done = cg.slots.filter(s => s.status === 'done');
  if (done.length < 2) {
    cgSetProgress(0, 0, 'Too many slot failures — need at least 2 to build a grid.');
    showToast('error', 'Comparison Grid', 'At least 2 slots must succeed.');
    cgRender();
    return;
  }

  cgSetProgress(total, total, 'Building comparison grid image…');
  try {
    const gridUrl = await cgBuildGrid(done);
    cgSetProgress(0, 0, '');
    cgShowPreview(gridUrl, 'Comparison Grid');
    cgShowResult(gridUrl);
    showToast('success', 'Comparison Grid Ready', 'Grid added to history and shown in viewer.');
    toggleCompGridPanel();
  } catch(e) {
    cgSetProgress(0, 0, 'Grid build failed: ' + e.message);
    showToast('error', 'Grid Build Failed', String(e));
  }
  cgRender();
}

// ── Preview in right pane ─────────────────────────────────────
function cgShowPreview(url, label) {
  const img = document.getElementById('cgPreviewImg');
  const ph  = document.getElementById('cgPreviewPlaceholder');
  const ttl = document.getElementById('cgPreviewTitle');
  if (img) { img.src = url; img.style.display = 'block'; }
  if (ph)  ph.style.display = 'none';
  if (ttl) ttl.textContent  = label || 'Preview';
}

// ── Progress ──────────────────────────────────────────────────
function cgSetProgress(value, max, label) {
  const el = document.getElementById('cgProgress');
  if (el) el.textContent = label || '';
  if (max > 0) setProgress(value, max);
  else         clearProgress();
}

// ── Show final result in main viewer after panel closes ───────
function cgShowResult(gridUrl) {
  state.currentImageUrl      = gridUrl;
  state.currentImageFilename = 'ComparisonGrid.png';
  state.lastGenMeta          = { positivePrompt: 'Comparison Grid', generatedAt: new Date().toISOString() };
  const img = document.getElementById('outputImg');
  if (img) { img.onload = null; img.src = gridUrl; img.style.display = 'block'; }
  const ph = document.getElementById('imgPlaceholder');
  if (ph)  ph.style.display = 'none';
  const sb = document.getElementById('saveBtn');
  if (sb)  sb.disabled = false;
  updateImageInfoBar(state.lastGenMeta);
  addToHistory(gridUrl, state.lastGenMeta);
  clearProgress();
}

// ── Generate one slot ─────────────────────────────────────────
async function cgGenerateSlot(slot) {
  const workflow = await buildWorkflow(null);
  // We always remove them so the slot's own loras (or none) are the only ones applied.
  // We also need to rewire any nodes that were pointing to LoraLoader outputs back
  // to the original model/clip sources before the lora chain.
  (function stripMainLoras() {
    // Collect lora node ids in chain order (they chain model→lora→lora→…)
    const loraIds = Object.keys(workflow).filter(id => workflow[id].class_type === 'LoraLoader');
    if (!loraIds.length) return;

    // For each non-lora node that references a lora output, trace back to the original source
    function traceBack(ref, outputIdx) {
      // ref is [nodeId, outputIndex]. If that node is a LoraLoader, follow its input.
      const n = workflow[ref[0]];
      if (!n || n.class_type !== 'LoraLoader') return ref;
      // LoraLoader inputs: model=[...,0], clip=[...,1]
      if (outputIdx === 0) return traceBack(n.inputs.model, 0);
      if (outputIdx === 1) return traceBack(n.inputs.clip, 1);
      return ref;
    }

    // Rewire all non-lora nodes
    Object.keys(workflow).forEach(id => {
      if (loraIds.includes(id)) return;
      const n = workflow[id];
      Object.keys(n.inputs).forEach(k => {
        const v = n.inputs[k];
        if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number') {
          if (loraIds.includes(v[0])) {
            n.inputs[k] = traceBack(v, v[1]);
          }
        }
      });
    });

    // Delete lora nodes
    loraIds.forEach(id => delete workflow[id]);
  })();

  for (const id in workflow) {
    const n = workflow[id];
    if (n.class_type === 'KSampler' || n.class_type === 'KSamplerAdvanced') {
      n.inputs.sampler_name = slot.sampler;
      n.inputs.scheduler    = slot.scheduler;
      n.inputs.steps        = parseInt(slot.steps)     || 28;
      n.inputs.cfg          = parseFloat(slot.cfg)     || 7;
      n.inputs.denoise      = parseFloat(slot.denoise) || 1;
      const seed = parseInt(slot.seed);
      n.inputs.seed = (!isNaN(seed) && seed !== -1) ? seed : Math.floor(Math.random() * 2**32);
    }
  }

  const clipIds = Object.keys(workflow).filter(id =>
    workflow[id].class_type === 'CLIPTextEncode' || workflow[id].class_type === 'CLIPTextEncodeSDXL'
  );
  if (clipIds[0]) workflow[clipIds[0]].inputs.text = slot.prompt;
  if (clipIds[1]) workflow[clipIds[1]].inputs.text = slot.neg || '';

  if (slot.useModel && slot.modelName) {
    for (const id in workflow) {
      const n = workflow[id];
      if (slot.modelType === 'checkpoint' && n.class_type === 'CheckpointLoaderSimple')
        n.inputs.ckpt_name = slot.modelName;
      if (slot.modelType === 'diffusion' && n.class_type === 'UNETLoader')
        n.inputs.unet_name = slot.modelName;
    }
  }

  if (slot.loras.length > 0) {
    let modelSrc = null, clipSrc = null;
    for (const id in workflow) {
      const n = workflow[id];
      if (n.class_type === 'CheckpointLoaderSimple') { modelSrc = [id,0]; clipSrc = [id,1]; }
      if (n.class_type === 'UNETLoader')             { modelSrc = [id,0]; }
      if (n.class_type === 'CLIPLoader')             { clipSrc  = [id,0]; }
    }
    slot.loras.forEach(l => {
      const lid = 'cglr_' + Math.random().toString(36).slice(2,8);
      workflow[lid] = { class_type:'LoraLoader', inputs:{
        model:modelSrc, clip:clipSrc, lora_name:l.name,
        strength_model:parseFloat(l.strength)||1,
        strength_clip: parseFloat(l.strength)||1,
      }};
      modelSrc=[lid,0]; clipSrc=[lid,1];
    });
    for (const id in workflow) {
      const n = workflow[id];
      if (n.class_type==='KSampler'||n.class_type==='KSamplerAdvanced') n.inputs.model=modelSrc;
      if (n.class_type==='CLIPTextEncode'||n.class_type==='CLIPTextEncodeSDXL') n.inputs.clip=clipSrc;
    }
  }

  const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: state.clientId })
  });
  if (!res.ok) throw new Error(await res.text());
  const { prompt_id } = await res.json();

  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const d     = await (await comfyFetch(`${state.comfyUrl}/history/${prompt_id}`)).json();
    const entry = d[prompt_id];
    if (entry?.status?.completed) {
      for (const nid in entry.outputs) {
        const imgs = entry.outputs[nid]?.images;
        if (imgs?.length) {
          const img = imgs[0];
          const p = new URLSearchParams({ filename:img.filename, subfolder:img.subfolder, type:img.type });
          return URL.createObjectURL(await (await comfyFetch(`${state.comfyUrl}/view?${p}`)).blob());
        }
      }
    }
  }
  throw new Error('Timed out waiting for slot image');
}

// ═════════════════════════════════════════════════════════════
// XYZ PLOT — axis types, rendering, generation
// ═════════════════════════════════════════════════════════════

const CG_SAMPLERS = [
  'euler','euler_cfg_pp','euler_ancestral','euler_ancestral_cfg_pp',
  'heun','heunpp2','exp_heun_2_x0','exp_heun_2_x0_sde','dpm_2','dpm_2_ancestral','lms',
  'dpm_fast','dpm_adaptive','dpmpp_2s_ancestral','dpmpp_2s_ancestral_cfg_pp',
  'dpmpp_sde','dpmpp_sde_gpu','dpmpp_2m','dpmpp_2m_cfg_pp','dpmpp_2m_sde','dpmpp_2m_sde_gpu',
  'dpmpp_2m_sde_heun','dpmpp_2m_sde_heun_gpu','dpmpp_3m_sde','dpmpp_3m_sde_gpu',
  'ddpm','lcm','ipndm','ipndm_v','deis',
  'res_multistep','res_multistep_cfg-pp','res_multistep_ancestral','res_multistep_ancestral_cfg-pp',
  'gradient_estimation','gradient_estimation_cfg_pp','er_sde','seeds_2','seeds_3',
  'sa_solver','sa_solver_pece','ddim','uni_pc','uni_pc_bh2',
];
const CG_SCHEDULERS = ['simple','sgm_uniform','karras','exponential','ddim_uniform','beta','normal','kl_optimal'];

// Init base-settings selects in XYZ panel
function cgXYZInit() {
  const sampOpts = CG_SAMPLERS.map(v => `<option value="${v}">${v}</option>`).join('');
  const schedOpts = CG_SCHEDULERS.map(v => `<option value="${v}">${v}</option>`).join('');
  const sampEl = document.getElementById('cgXYZSampler');
  const schedEl = document.getElementById('cgXYZScheduler');
  if (sampEl && !sampEl._init) {
    sampEl.innerHTML = sampOpts;
    sampEl.value = document.getElementById('samplerName')?.value || 'euler_ancestral';
    sampEl._init = true;
  }
  if (schedEl && !schedEl._init) {
    schedEl.innerHTML = schedOpts;
    schedEl.value = document.getElementById('scheduler')?.value || 'karras';
    schedEl._init = true;
  }
  // Set base values from main UI
  const stepsEl = document.getElementById('cgXYZSteps');
  const cfgEl   = document.getElementById('cgXYZCfg');
  const denEl   = document.getElementById('cgXYZDenoise');
  if (stepsEl && !stepsEl._init) { stepsEl.value = document.getElementById('stepsNum')?.value || '28'; stepsEl._init = true; }
  if (cfgEl   && !cfgEl._init)   { cfgEl.value   = document.getElementById('cfgNum')?.value   || '7';  cfgEl._init   = true; }
  if (denEl   && !denEl._init)   { denEl.value   = document.getElementById('denoiseNum')?.value || '1'; denEl._init = true; }
  // Init axis type selects and render
  ['x','y','z'].forEach(ax => {
    const sel = document.getElementById(`cg${ax.toUpperCase()}Type`);
    if (sel) sel.value = cg.xyz[ax].type;
  });
  cgXYZRenderAll();
}

// Called when an axis type dropdown changes
function cgAxisTypeChange(ax) {
  const sel = document.getElementById(`cg${ax.toUpperCase()}Type`);
  cg.xyz[ax].type = sel.value;
  cg.xyz[ax].values = [];
  cg.xyz[ax].selectedList = [];
  cgXYZRenderAxis(ax);
  cgXYZUpdateCellCount();
}

function cgXYZRenderAll() {
  ['x','y','z'].forEach(ax => cgXYZRenderAxis(ax));
  cgXYZUpdateCellCount();
}

function cgXYZRenderAxis(ax) {
  const container = document.getElementById(`cg${ax.toUpperCase()}Values`);
  if (!container) return;
  const type = cg.xyz[ax].type;
  if (type === 'none') { container.innerHTML = '<span style="font-size:11px;color:var(--text-lo)">Disabled</span>'; return; }

  if (type === 'sampler' || type === 'scheduler') {
    cgXYZRenderPickerAxis(ax, type);
  } else if (type === 'prompt') {
    cgXYZRenderTextAxis(ax);
  } else {
    cgXYZRenderNumberAxis(ax);
  }
}

// Sampler/Scheduler: tag-pill UI with mass-select popover
function cgXYZRenderPickerAxis(ax, type) {
  const container = document.getElementById(`cg${ax.toUpperCase()}Values`);
  const items = type === 'sampler' ? CG_SAMPLERS : CG_SCHEDULERS;
  const selected = cg.xyz[ax].selectedList;

  const tagsHtml = selected.map(v => `
    <span class="cg-axis-tag">
      ${cgE(v)}
      <button class="cg-axis-tag-del" onclick="cgXYZRemovePickerItem('${ax}','${cgE(v)}')" title="Remove">✕</button>
    </span>`).join('');

  container.innerHTML = `
    <div class="cg-axis-selected-tags" id="cgAxisTags_${ax}">
      ${tagsHtml || '<span style="font-size:10px;color:var(--text-lo)">None selected</span>'}
    </div>
    <button class="cg-axis-mass-btn" onclick="cgOpenPicker('${ax}','${type}')">⊞ Select ${type}s…</button>`;
}

// Number axes: list of number inputs
function cgXYZRenderNumberAxis(ax) {
  const container = document.getElementById(`cg${ax.toUpperCase()}Values`);
  const vals = cg.xyz[ax].values;
  if (vals.length === 0) vals.push('');

  const rowsHtml = vals.map((v, i) => `
    <div class="cg-axis-value-row">
      <span class="cg-axis-value-label">${i+1}</span>
      <input class="cg-axis-value-input" type="number" value="${cgE(v)}"
        oninput="cgXYZSetValue('${ax}',${i},this.value)"
        ${ax === 'x' ? 'step="any"' : 'step="any"'} />
      <button class="cg-slot-del" onclick="cgXYZRemoveValue('${ax}',${i})" title="Remove" ${vals.length<=1?'disabled':''}>✕</button>
    </div>`).join('');

  container.innerHTML = rowsHtml + `<button class="cg-axis-add-btn" onclick="cgXYZAddValue('${ax}')">＋ Add value</button>`;
}

// Prompt variation: list of textareas
function cgXYZRenderTextAxis(ax) {
  const container = document.getElementById(`cg${ax.toUpperCase()}Values`);
  const vals = cg.xyz[ax].values;
  if (vals.length === 0) vals.push('');

  const rowsHtml = vals.map((v, i) => `
    <div class="cg-axis-value-row" style="align-items:flex-start">
      <span class="cg-axis-value-label" style="margin-top:6px">${i+1}</span>
      <textarea class="cg-axis-value-ta" rows="2"
        oninput="cgXYZSetValue('${ax}',${i},this.value)">${cgE(v)}</textarea>
      <button class="cg-slot-del" onclick="cgXYZRemoveValue('${ax}',${i})" title="Remove" ${vals.length<=1?'disabled':''}>✕</button>
    </div>`).join('');

  container.innerHTML = rowsHtml + `<button class="cg-axis-add-btn" onclick="cgXYZAddValue('${ax}')">＋ Add prompt</button>`;
}

function cgXYZSetValue(ax, idx, val) { cg.xyz[ax].values[idx] = val; cgXYZUpdateCellCount(); }
function cgXYZAddValue(ax)           { cg.xyz[ax].values.push(''); cgXYZRenderAxis(ax); cgXYZUpdateCellCount(); }
function cgXYZRemoveValue(ax, idx)   {
  cg.xyz[ax].values.splice(idx, 1);
  if (cg.xyz[ax].values.length === 0) cg.xyz[ax].values.push('');
  cgXYZRenderAxis(ax);
  cgXYZUpdateCellCount();
}
function cgXYZRemovePickerItem(ax, val) {
  cg.xyz[ax].selectedList = cg.xyz[ax].selectedList.filter(v => v !== val);
  cgXYZRenderAxis(ax);
  cgXYZUpdateCellCount();
}

// Get effective value list for an axis (picker or number/text)
function cgXYZGetAxisValues(ax) {
  const a = cg.xyz[ax];
  if (a.type === 'none') return null;
  if (a.type === 'sampler' || a.type === 'scheduler') {
    return a.selectedList.length ? a.selectedList : null;
  }
  const v = a.values.map(x => x.toString().trim()).filter(Boolean);
  return v.length ? v : null;
}

function cgXYZUpdateCellCount() {
  const xVals = cgXYZGetAxisValues('x');
  const yVals = cgXYZGetAxisValues('y');
  const zVals = cgXYZGetAxisValues('z');
  const xN = xVals?.length || 0;
  const yN = yVals?.length || 1;
  const zN = zVals?.length || 1;
  const total = xN * yN * zN;
  const el = document.getElementById('cgXYZCellCount');
  if (el) el.textContent = xN === 0 ? 'Configure X axis first' : `${total} cell${total !== 1 ? 's' : ''} (${xN}${yVals ? '×'+yN : ''}${zVals ? '×'+zN : ''})`;
  const runBtn = document.getElementById('cgXYZRunBtn');
  if (runBtn) runBtn.disabled = total < 2 || cg.running;
}

function cgXYZRandomSeed() {
  const el = document.getElementById('cgXYZSeedVal');
  if (el) el.value = Math.floor(Math.random() * 2**32);
}

// ── Picker popover ────────────────────────────────────────────
let _cgPickerAx = null, _cgPickerType = null;
function cgOpenPicker(ax, type) {
  _cgPickerAx = ax; _cgPickerType = type;
  const items  = type === 'sampler' ? CG_SAMPLERS : CG_SCHEDULERS;
  const selected = new Set(cg.xyz[ax].selectedList);
  const title  = document.getElementById('cgPickerTitle');
  const list   = document.getElementById('cgPickerList');
  if (title) title.textContent = `Select ${type}s`;
  if (list) {
    list.innerHTML = items.map(v => `
      <div class="cg-picker-item${selected.has(v)?' selected':''}" onclick="cgPickerToggle(this,'${cgE(v)}')">
        ${cgE(v)}
      </div>`).join('');
  }
  // Position near the button
  const popover = document.getElementById('cgPickerPopover');
  const backdrop = document.getElementById('cgPickerBackdrop');
  if (popover) {
    // Center it roughly
    popover.style.top  = '50%';
    popover.style.left = '50%';
    popover.style.transform = 'translate(-50%,-50%)';
    popover.style.display = 'flex';
  }
  if (backdrop) backdrop.style.display = '';
}
function cgPickerToggle(el, val) {
  el.classList.toggle('selected');
}
function cgPickerSelectAll() {
  document.querySelectorAll('#cgPickerList .cg-picker-item').forEach(el => el.classList.add('selected'));
}
function cgPickerSelectNone() {
  document.querySelectorAll('#cgPickerList .cg-picker-item').forEach(el => el.classList.remove('selected'));
}
function cgClosePicker() {
  document.getElementById('cgPickerPopover').style.display = 'none';
  document.getElementById('cgPickerBackdrop').style.display = 'none';
}
function cgPickerApply() {
  if (!_cgPickerAx) return;
  const selected = [];
  document.querySelectorAll('#cgPickerList .cg-picker-item.selected').forEach(el => {
    selected.push(el.textContent.trim());
  });
  cg.xyz[_cgPickerAx].selectedList = selected;
  cgClosePicker();
  cgXYZRenderAxis(_cgPickerAx);
  cgXYZUpdateCellCount();
}

// ── XYZ Run ───────────────────────────────────────────────────
async function cgXYZRun() {
  if (cg.running) return;
  const xVals = cgXYZGetAxisValues('x');
  if (!xVals) { showToast('error', 'X axis empty', 'Add at least one value to the X axis.'); return; }
  const yVals = cgXYZGetAxisValues('y') || [null];
  const zVals = cgXYZGetAxisValues('z') || [null];

  // Base settings
  const baseSampler  = document.getElementById('cgXYZSampler')?.value  || 'euler_ancestral';
  const baseScheduler= document.getElementById('cgXYZScheduler')?.value || 'karras';
  const baseSteps    = parseInt(document.getElementById('cgXYZSteps')?.value)   || 28;
  const baseCfg      = parseFloat(document.getElementById('cgXYZCfg')?.value)   || 7;
  const baseDenoise  = parseFloat(document.getElementById('cgXYZDenoise')?.value)|| 1;
  const useSharedSeed= document.getElementById('cgXYZSharedSeed')?.checked;
  const seedVal      = parseInt(document.getElementById('cgXYZSeedVal')?.value);
  const sharedSeed   = useSharedSeed ? (isNaN(seedVal) || seedVal === -1 ? Math.floor(Math.random() * 2**32) : seedVal) : null;
  const sendAll      = document.getElementById('cgXYZSendAll')?.checked;
  const fontSize     = parseInt(document.getElementById('cgXYZFontSize')?.value) || 17;

  const basePrompt   = cgApplyPrepend(document.getElementById('positivePrompt')?.value || '');
  const baseNeg      = cgApplyNegPrepend(document.getElementById('negativePrompt')?.value || '');

  // Build all cells
  const cells = []; // { xVal, yVal, zVal, slot }
  for (const zVal of zVals) {
    for (const yVal of yVals) {
      for (const xVal of xVals) {
        const slot = cgDefaultSlot();
        slot.prompt  = basePrompt;
        slot.neg     = baseNeg;
        slot.sampler   = baseSampler;
        slot.scheduler = baseScheduler;
        slot.steps     = String(baseSteps);
        slot.cfg       = String(baseCfg);
        slot.denoise   = String(baseDenoise);
        slot.seed      = sharedSeed !== null ? String(sharedSeed) : '-1';
        cgXYZApplyValue(slot, cg.xyz.x.type, xVal);
        if (yVal !== null) cgXYZApplyValue(slot, cg.xyz.y.type, yVal);
        if (zVal !== null) cgXYZApplyValue(slot, cg.xyz.z.type, zVal);
        slot.label = cgXYZBuildLabel(xVal, yVal, zVal);
        cells.push({ xVal, yVal, zVal, slot });
      }
    }
  }

  if (cells.length < 2) { showToast('error', 'Need at least 2 cells', 'Add more values to your axes.'); return; }

  cg.running = true;
  const runBtn = document.getElementById('cgXYZRunBtn');
  if (runBtn) runBtn.disabled = true;

  const progressEl = document.getElementById('cgXYZProgress');
  const total = cells.length;

  for (let i = 0; i < total; i++) {
    const c = cells[i];
    if (progressEl) progressEl.textContent = `Generating cell ${i+1} of ${total}…`;
    setProgress(i, total);
    try {
      c.slot.resultUrl = await cgGenerateSlot(c.slot);
      c.slot.status    = 'done';
      cgShowPreview(c.slot.resultUrl, c.slot.label || `Cell ${i+1}`);
      if (sendAll) {
        addToHistory(c.slot.resultUrl, {
          positivePrompt: c.slot.prompt || c.slot.label || `XYZ Cell ${i+1}`,
          negativePrompt: c.slot.neg,
          generatedAt:    new Date().toISOString(),
        });
      }
    } catch(e) {
      console.error('XYZ cell error:', e);
      c.slot.status = 'error';
    }
  }

  cg.running = false;
  const done = cells.filter(c => c.slot.status === 'done');
  if (done.length < 2) {
    if (progressEl) progressEl.textContent = 'Too many failures.';
    showToast('error', 'XYZ Plot', 'At least 2 cells must succeed to build a grid.');
    if (runBtn) runBtn.disabled = false;
    cgXYZUpdateCellCount();
    clearProgress();
    return;
  }

  if (progressEl) progressEl.textContent = 'Building XYZ grid…';
  try {
    const gridUrl = await cgXYZBuildGrid(cells, xVals, yVals, zVals, fontSize);
    cgSetProgress(0, 0, '');
    cgShowPreview(gridUrl, 'XYZ Plot');
    cgShowResult(gridUrl);
    showToast('success', 'XYZ Plot Ready', 'Grid added to history and shown in viewer.');
    toggleCompGridPanel();
  } catch(e) {
    if (progressEl) progressEl.textContent = 'Grid build failed: ' + e.message;
    showToast('error', 'XYZ Grid Failed', String(e));
  }

  if (runBtn) runBtn.disabled = false;
  cgXYZUpdateCellCount();
  clearProgress();
}

function cgXYZApplyValue(slot, type, val) {
  if (val === null || val === undefined) return;
  switch(type) {
    case 'sampler':    slot.sampler   = val; break;
    case 'scheduler':  slot.scheduler = val; break;
    case 'steps':      slot.steps     = val; break;
    case 'cfg':        slot.cfg       = val; break;
    case 'denoise':    slot.denoise   = val; break;
    case 'seed':       slot.seed      = val; break;
    case 'prompt':     slot.prompt    = val; break;
    case 'checkpoint': slot.useModel  = true; slot.modelType = 'checkpoint'; slot.modelName = val; break;
  }
}

function cgXYZBuildLabel(xVal, yVal, zVal) {
  const parts = [xVal, yVal, zVal].filter(v => v !== null && v !== undefined);
  return parts.join(' / ');
}

// Build an XYZ grid canvas — rows = Y axis, cols = X axis, Z = separate grids stacked
async function cgXYZBuildGrid(cells, xVals, yVals, zVals, fontSize) {
  const doneCells = cells.filter(c => c.slot.status === 'done');
  if (!doneCells.length) throw new Error('No successful cells');

  const pad = 14;
  const bmps = await Promise.all(
    cells.map(c => c.slot.resultUrl
      ? fetch(c.slot.resultUrl).then(r=>r.blob()).then(b=>createImageBitmap(b))
      : null
    )
  );

  const imgW = bmps.find(Boolean).width;
  const imgH = bmps.find(Boolean).height;
  const cellW = imgW + pad * 2;
  const labelH = fontSize + pad * 2;
  const cellH = imgH + labelH + pad;

  const nX = xVals.length;
  const nY = yVals.length;
  const nZ = zVals.length;

  // Canvas: for each Z slice → row of (nY) rows × (nX) cols, separated by a small Z header
  const zHeaderH = nZ > 1 ? fontSize + pad : 0;
  const sliceH   = nY * cellH;
  const headerRowH = labelH; // X-axis labels at top
  const yLabelW  = nY > 1 ? fontSize * 3 + pad * 2 : 0;
  const totalW   = yLabelW + nX * cellW;
  const totalH   = nZ * (zHeaderH + headerRowH + sliceH) + pad;

  const canvas  = document.createElement('canvas');
  canvas.width  = totalW;
  canvas.height = totalH;
  const ctx     = canvas.getContext('2d');
  ctx.fillStyle = '#0d0e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let offsetY = pad / 2;

  for (let zi = 0; zi < nZ; zi++) {
    // Z header
    if (nZ > 1 && zVals[zi] !== null) {
      ctx.fillStyle = 'rgba(255,200,110,0.12)';
      ctx.fillRect(0, offsetY, totalW, zHeaderH);
      ctx.font = `700 ${fontSize}px system-ui,sans-serif`;
      ctx.fillStyle = '#ffc86e';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Z: ' + String(zVals[zi]), pad, offsetY + zHeaderH / 2, totalW - pad * 2);
      offsetY += zHeaderH;
    }

    // X-axis labels row
    ctx.fillStyle = 'rgba(110,181,255,0.08)';
    ctx.fillRect(yLabelW, offsetY, nX * cellW, headerRowH);
    for (let xi = 0; xi < nX; xi++) {
      ctx.font = `600 ${fontSize - 2}px system-ui,sans-serif`;
      ctx.fillStyle = '#6eb5ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lbl = String(xVals[xi]);
      ctx.fillText(lbl, yLabelW + xi * cellW + cellW / 2, offsetY + headerRowH / 2, cellW - pad);
    }
    offsetY += headerRowH;

    // Rows (Y) and cols (X)
    for (let yi = 0; yi < nY; yi++) {
      // Y label
      if (nY > 1 && yVals[yi] !== null) {
        ctx.save();
        ctx.translate(yLabelW / 2, offsetY + cellH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `600 ${fontSize - 2}px system-ui,sans-serif`;
        ctx.fillStyle = '#80e88a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(yVals[yi]), 0, 0, cellH - pad * 2);
        ctx.restore();
      }

      for (let xi = 0; xi < nX; xi++) {
        const cellIdx = zi * nX * nY + yi * nX + xi;
        const cell = cells[cellIdx];
        const bmp  = bmps[cellIdx];
        const cx   = yLabelW + xi * cellW;
        const cy   = offsetY;

        // Separator lines
        if (xi > 0) { ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(cx,cy,1,cellH); }

        if (bmp) {
          ctx.drawImage(bmp, cx + pad, cy + pad, imgW, imgH);
        } else {
          // Draw error placeholder
          ctx.fillStyle = 'rgba(255,80,80,0.08)';
          ctx.fillRect(cx + pad, cy + pad, imgW, imgH);
          ctx.font = `400 13px system-ui,sans-serif`;
          ctx.fillStyle = '#f87';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('error', cx + pad + imgW/2, cy + pad + imgH/2);
        }
      }
      offsetY += cellH;
    }
  }

  return new Promise((res,rej) =>
    canvas.toBlob(b => b ? res(URL.createObjectURL(b)) : rej(new Error('toBlob failed')), 'image/png')
  );
}


async function cgBuildGrid(slots) {
  const fontSize = parseInt(document.getElementById('cgFontSize')?.value) || 17;
  const pad      = 14;
  const bmps     = await Promise.all(slots.map(s =>
    fetch(s.resultUrl).then(r=>r.blob()).then(b=>createImageBitmap(b))
  ));
  const imgW    = bmps[0].width;
  const imgH    = bmps[0].height;
  const hasLbl  = slots.some(s => s.label?.trim());
  const labelH  = hasLbl ? fontSize + pad * 2 : 0;
  const cellW   = imgW + pad * 2;
  const cellH   = imgH + labelH + pad * 2;
  const canvas  = document.createElement('canvas');
  canvas.width  = cellW * slots.length;
  canvas.height = cellH;
  const ctx     = canvas.getContext('2d');
  ctx.fillStyle = '#0d0e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  bmps.forEach((bmp, i) => {
    const x = i * cellW;
    const s = slots[i];
    if (hasLbl) {
      ctx.fillStyle = 'rgba(16,18,40,0.97)';
      ctx.fillRect(x, 0, cellW, labelH);
      if (s.label?.trim()) {
        ctx.font = `600 ${fontSize}px system-ui,sans-serif`;
        ctx.fillStyle = '#e8e8ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label.trim(), x + cellW/2, labelH/2, cellW - pad*2);
      }
    }
    if (i > 0) { ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(x,0,1,canvas.height); }
    ctx.drawImage(bmp, x+pad, labelH+pad, imgW, imgH);
  });
  return new Promise((res,rej) =>
    canvas.toBlob(b => b ? res(URL.createObjectURL(b)) : rej(new Error('toBlob failed')), 'image/png')
  );
}

// ── Utility ───────────────────────────────────────────────────
function cgE(str) {
  return String(str??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ═════════════════════════════════════════════════════════════
// PROMPT LIBRARY  (modal, like settings)
// ═════════════════════════════════════════════════════════════

const pl = {
  prompts: [],   // [ { id, label, positive, negative, createdAt } ]
  nextId:  1,
  editingId: null,
};

// ── Init ──────────────────────────────────────────────────────
function _initPromptLibrary() {
  const stored = localStorage.getItem('comfyStudioPL');
  if (stored) {
    try {
      const d = JSON.parse(stored);
      pl.prompts = d.prompts || [];
      pl.nextId  = d.nextId  || 1;
    } catch(e) {}
  }
  // Restore prepend toggle preference (default true)
  state.plIncludePrepend = localStorage.getItem('comfyStudioPLPrepend') !== 'false';
  const tog = document.getElementById('plIncludePrepend');
  if (tog) tog.checked = state.plIncludePrepend;
}
document.addEventListener('DOMContentLoaded', _initPromptLibrary);

function plSave() {
  localStorage.setItem('comfyStudioPL', JSON.stringify({
    prompts: pl.prompts,
    nextId:  pl.nextId,
  }));
}

function openPromptLibrary() {
  document.getElementById('plModal').classList.add('open');
  document.getElementById('plBackdrop').classList.add('open');
  // Sync the toggle to current state
  const tog = document.getElementById('plIncludePrepend');
  if (tog) tog.checked = state.plIncludePrepend !== false;
  plRender();
}

function closePromptLibrary() {
  document.getElementById('plModal').classList.remove('open');
  document.getElementById('plBackdrop').classList.remove('open');
  pl.editingId = null;
}

// ── Save current prompt ───────────────────────────────────────
function saveCurrentPrompt() {
  const includePrepend = state.plIncludePrepend !== false;
  const pos = document.getElementById('positivePrompt')?.value || '';
  const neg = document.getElementById('negativePrompt')?.value || '';

  let fullPos = pos;
  let fullNeg = neg;
  if (includePrepend) {
    const qtPos = (state.qualityTagsEnabled && state.qualityTagsText.trim())
      ? state.qualityTagsText.trim().replace(/,\s*$/, '') + ', ' : '';
    const qtNeg = (state.negQualityTagsEnabled && state.negQualityTagsText.trim())
      ? state.negQualityTagsText.trim().replace(/,\s*$/, '') + ', ' : '';
    fullPos = qtPos + pos;
    fullNeg = qtNeg + neg;
  }

  const entry = {
    id:        pl.nextId++,
    label:     '',
    positive:  fullPos,
    negative:  fullNeg,
    createdAt: new Date().toISOString(),
  };
  pl.prompts.unshift(entry);
  plSave();
  plRender();
  showToast('success', 'Prompt Saved', includePrepend ? 'Saved with prepend tags.' : 'Saved without prepend tags.');
}

// ── Render ────────────────────────────────────────────────────
function plRender() {
  const list = document.getElementById('plList');
  if (!list) return;

  if (!pl.prompts.length) {
    list.innerHTML = '<p class="empty-hint" style="padding:16px">No saved prompts yet — click 💾 Save Prompt to add one.</p>';
    return;
  }

  list.innerHTML = '';
  pl.prompts.forEach((entry, i) => {
    const isEditing = pl.editingId === entry.id;
    const el = document.createElement('div');
    el.className = 'pl-entry' + (isEditing ? ' pl-editing' : '');
    el.dataset.plid = entry.id;

    if (isEditing) {
      el.innerHTML = `
        <div class="pl-entry-header">
          <input class="pl-label-input" id="pl-label-${entry.id}" value="${plE(entry.label)}" placeholder="Label (optional)…" />
          <div class="pl-header-btns">
            <button class="pl-btn pl-btn-save" onclick="plSaveEdit(${entry.id})" title="Save changes">✓ Save</button>
            <button class="pl-btn pl-btn-cancel" onclick="plCancelEdit()" title="Cancel">✕</button>
          </div>
        </div>
        <div style="position:relative;margin-bottom:6px">
          <div class="prompt-highlight-layer pl-highlight-layer" id="pl-hl-pos-${entry.id}" aria-hidden="true"></div>
          <textarea class="pl-ta pl-pos-ta" id="pl-pos-${entry.id}" rows="4" placeholder="Positive prompt…">${plE(entry.positive)}</textarea>
        </div>
        <div style="position:relative;margin-bottom:6px">
          <div class="prompt-highlight-layer pl-highlight-layer" id="pl-hl-neg-${entry.id}" aria-hidden="true"></div>
          <textarea class="pl-ta pl-neg-ta" id="pl-neg-${entry.id}" rows="2" placeholder="Negative prompt…">${plE(entry.negative)}</textarea>
        </div>`;
    } else {
      const previewPos = entry.positive ? entry.positive.slice(0, 120) + (entry.positive.length > 120 ? '…' : '') : '(empty)';
      const previewNeg = entry.negative ? entry.negative.slice(0, 80)  + (entry.negative.length  > 80  ? '…' : '') : '';
      const date = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '';
      el.innerHTML = `
        <div class="pl-entry-header">
          <div class="pl-entry-meta">
            <span class="pl-entry-label">${entry.label ? plE(entry.label) : '<span class="pl-no-label">Untitled</span>'}</span>
            ${date ? `<span class="pl-entry-date">${date}</span>` : ''}
          </div>
          <div class="pl-header-btns">
            <button class="pl-btn pl-btn-load" onclick="plLoad(${entry.id})" title="Load into prompts">⤓ Load</button>
            <button class="pl-btn pl-btn-edit" onclick="plStartEdit(${entry.id})" title="Edit">✏</button>
            <button class="pl-btn pl-btn-del"  onclick="plDelete(${entry.id})" title="Delete">✕</button>
          </div>
        </div>
        <div class="pl-preview-pos">${plE(previewPos)}</div>
        ${previewNeg ? `<div class="pl-preview-neg">${plE(previewNeg)}</div>` : ''}`;
    }
    list.appendChild(el);

    if (isEditing) {
      // Wire highlight + autocomplete for edit textareas
      setTimeout(() => {
        const posTA = document.getElementById(`pl-pos-${entry.id}`);
        const negTA = document.getElementById(`pl-neg-${entry.id}`);
        [posTA, negTA].forEach((ta, idx) => {
          if (!ta) return;
          const hlId = idx === 0 ? `pl-hl-pos-${entry.id}` : `pl-hl-neg-${entry.id}`;
          const hl = document.getElementById(hlId);
          function updateHL() {
            if (!hl) return;
            if (!state.modifierHighlightEnabled) { hl.innerHTML = ''; return; }
            hl.innerHTML = escapeHTMLPreserveStructure(ta.value);
            const cs = getComputedStyle(ta);
            hl.style.fontSize = cs.fontSize;
            hl.style.lineHeight = cs.lineHeight;
            hl.style.fontFamily = cs.fontFamily;
            hl.style.letterSpacing = cs.letterSpacing;
            hl.style.width = ta.clientWidth + 'px';
            hl.scrollTop = ta.scrollTop;
          }
          ta.addEventListener('input', updateHL);
          ta.addEventListener('scroll', () => { if (hl) hl.scrollTop = ta.scrollTop; });
          updateHL();

          if (!state.autocompleteData.length) return;
          let dropdown = null;
          function plShowAC(matches) {
            plHideAC();
            if (!matches.length) return;
            dropdown = document.createElement('div');
            dropdown.className = 'autocomplete-list';
            matches.forEach((m, i) => {
              const item = document.createElement('div');
              item.className = 'autocomplete-item' + (i === 0 ? ' active' : '');
              item.textContent = m;
              item.addEventListener('mousedown', e => { e.preventDefault(); plAcceptTag(m); plHideAC(); });
              dropdown.appendChild(item);
            });
            const rect = ta.getBoundingClientRect();
            dropdown.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom+2}px;width:${rect.width}px;z-index:9999`;
            document.body.appendChild(dropdown);
          }
          function plHideAC() { if (dropdown) { dropdown.remove(); dropdown = null; } }
          function plAcceptTag(tag) {
            const cur = getTagAtCursor(ta);
            if (!cur) return;
            let finalTag = tag;
            if (state.acReplaceUnderscores) finalTag = finalTag.replace(/_/g, ' ');
            if (state.acEscapeParens) finalTag = finalTag.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
            const start = ta.selectionStart - cur.length;
            ta.value = ta.value.slice(0, start) + finalTag + ta.value.slice(ta.selectionStart);
            ta.selectionStart = ta.selectionEnd = start + finalTag.length;
            updateHL();
          }
          ta.addEventListener('input', () => {
            if (!state.autocompleteData.length) return;
            const cur = getTagAtCursor(ta);
            if (!cur || cur.length < 2) { plHideAC(); return; }
            const matches = state.autocompleteData.filter(t => t.toLowerCase().startsWith(cur.toLowerCase())).slice(0, 8);
            if (!matches.length) { plHideAC(); return; }
            plShowAC(matches);
          });
          ta.addEventListener('keydown', e => {
            if (!dropdown) return;
            const items = dropdown.querySelectorAll('.autocomplete-item');
            const active = dropdown.querySelector('.autocomplete-item.active');
            let idx = [...items].indexOf(active);
            if (e.key === 'ArrowDown')  { e.preventDefault(); items.forEach((it,i) => it.classList.toggle('active', i===Math.min(idx+1, items.length-1))); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items.forEach((it,i) => it.classList.toggle('active', i===Math.max(idx-1, 0))); }
            else if (e.key === 'Enter' || e.key === 'Tab') {
              const a = dropdown.querySelector('.autocomplete-item.active');
              if (a) { e.preventDefault(); plAcceptTag(a.textContent); plHideAC(); }
            } else if (e.key === 'Escape') plHideAC();
          });
          ta.addEventListener('blur', () => setTimeout(plHideAC, 150));
        });
      }, 0);
    }
  });
}

function plE(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plLoad(id) {
  const entry = pl.prompts.find(p => p.id === id);
  if (!entry) return;
  document.getElementById('positivePrompt').value = entry.positive || '';
  document.getElementById('negativePrompt').value = entry.negative || '';
  updatePromptHighlight('positive');
  updatePromptHighlight('negative');
  showToast('success', 'Prompt Loaded', `Loaded "${entry.label || 'Untitled'}" into prompts.`);
}

function plStartEdit(id) {
  pl.editingId = id;
  plRender();
}

function plCancelEdit() {
  pl.editingId = null;
  plRender();
}

function plSaveEdit(id) {
  const entry = pl.prompts.find(p => p.id === id);
  if (!entry) return;
  entry.label    = document.getElementById(`pl-label-${id}`)?.value || '';
  entry.positive = document.getElementById(`pl-pos-${id}`)?.value   || '';
  entry.negative = document.getElementById(`pl-neg-${id}`)?.value   || '';
  pl.editingId = null;
  plSave();
  plRender();
}

function plDelete(id) {
  const entry = pl.prompts.find(p => p.id === id);
  showConfirm(`Delete "${entry?.label || 'Untitled'}"? This cannot be undone.`, () => {
    pl.prompts = pl.prompts.filter(p => p.id !== id);
    if (pl.editingId === id) pl.editingId = null;
    plSave();
    plRender();
  });
}

// ═════════════════════════════════════════════════════════════
// REGIONAL PROMPTING
// ═════════════════════════════════════════════════════════════

const REGION_COLORS = [
  { id:'r1', hex:'#e05050', label:'Region 1', rgba:[224,80,80,0.55]  },
  { id:'r2', hex:'#4fa8e0', label:'Region 2', rgba:[79,168,224,0.55] },
  { id:'r3', hex:'#50c060', label:'Region 3', rgba:[80,192,96,0.55]  },
  { id:'r4', hex:'#e0b040', label:'Region 4', rgba:[224,176,64,0.55] },
  { id:'r5', hex:'#c050e0', label:'Region 5', rgba:[192,80,224,0.55] },
  { id:'r6', hex:'#e07030', label:'Region 6', rgba:[224,112,48,0.55] },
];

const rpState = {
  open: false,
  enabled: false,
  tool: 'brush',    // brush | fill | eraser
  brushSize: 32,
  activeRegionId: null,
  regions: [],      // [{ id, colorDef, prompt, negPrompt, strength, feather, enabled, maskCanvas }]
  painting: false,
  lastX: 0, lastY: 0,
  _moveH: null, _upH: null, _keyH: null,
  prependQualityTags: false,
  prependNegQualityTags: false,
  impactPackAvailable: null,  // null=unchecked, true=available, false=unavailable
  differentialDiffusionAvailable: null, // null=unchecked, true=available, false=unavailable
};

// ── Toggle ────────────────────────────────────────────────────
function toggleRegionalPrompt(enabled) {
  rpState.enabled = enabled;
  localStorage.setItem('comfyStudioRP', enabled);
  const btn = document.getElementById('actionRegionalBtn');
  if (btn) btn.style.display = enabled ? '' : 'none';
}

// ── Import main prompt into RP global fields ──────────────────
function rpImportPrompt(side) {
  if (side === 'pos' || side === 'both') {
    const src = document.getElementById('positivePrompt')?.value ?? '';
    const ta = document.getElementById('rpGlobalPrompt');
    if (ta) { ta.value = src; rpUpdateHL('rpGlobalPrompt', 'rp-hl-global'); }
  }
  if (side === 'neg' || side === 'both') {
    const src = document.getElementById('negativePrompt')?.value ?? '';
    const ta = document.getElementById('rpGlobalNegPrompt');
    if (ta) { ta.value = src; rpUpdateHL('rpGlobalNegPrompt', 'rp-hl-global-neg'); }
  }
}

// ── Toggle prepend quality tags for RP ───────────────────────
function rpTogglePrepend(side, enabled) {
  if (side === 'pos') rpState.prependQualityTags = enabled;
  if (side === 'neg') rpState.prependNegQualityTags = enabled;
}

// ── Open / Close ──────────────────────────────────────────────
function openRegionalPrompt() {
  document.getElementById('rpModal').classList.add('open');
  document.getElementById('rpBackdrop').classList.add('open');
  rpState.open = true;
  rpInitCanvas();
  rpRenderRegions();
  rpSetTool('brush');
  if (rpState.regions.length === 0) rpAddRegion();

  // Detect available nodes (no-op if already cached)
  rpDetectAll();
  rpUpdatePathIndicator();

  rpState._keyH = (e) => {
    if (!rpState.open) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') closeRegionalPrompt();
  };
  document.addEventListener('keydown', rpState._keyH);
}

function closeRegionalPrompt() {
  document.getElementById('rpModal').classList.remove('open');
  document.getElementById('rpBackdrop').classList.remove('open');
  rpState.open = false;
  rpState.painting = false;
  if (rpState._moveH) { window.removeEventListener('mousemove', rpState._moveH); rpState._moveH = null; }
  if (rpState._upH)   { window.removeEventListener('mouseup',   rpState._upH);   rpState._upH   = null; }
  if (rpState._keyH)  { document.removeEventListener('keydown', rpState._keyH);  rpState._keyH  = null; }
}

// ── Canvas init ───────────────────────────────────────────────
function rpInitCanvas() {
  const wrap = document.getElementById('rpCanvasWrap');
  const baseC = document.getElementById('rpBaseCanvas');
  const maskC = document.getElementById('rpMaskCanvas');
  const overlayC = document.getElementById('rpOverlayCanvas');

  // Match the canvas aspect ratio to the current generation resolution
  const genW = state.resW || 512;
  const genH = state.resH || 512;
  wrap.style.aspectRatio = `${genW} / ${genH}`;
  const W = wrap.clientWidth || 512;
  const H = Math.round(W / (genW / genH));

  [baseC, maskC, overlayC].forEach(c => {
    c.width = W; c.height = H;
    c.style.width = W + 'px'; c.style.height = H + 'px';
  });

  // Draw resolution grid on base canvas as reference
  const ctx = baseC.getContext('2d');
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(0, 0, W, H);
  // Resolution label
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${state.resW} × ${state.resH}`, W/2, H/2);

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += W/4)  { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y <= H; y += H/4)  { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Ensure all region maskCanvases match new size
  rpState.regions.forEach(r => {
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    if (r.maskCanvas && r.maskCanvas.width > 0) {
      tmp.getContext('2d').drawImage(r.maskCanvas, 0, 0, W, H);
    }
    r.maskCanvas = tmp;
  });

  rpSetupEvents(overlayC);
  rpRedrawOverlay();
}

// ── Drawing events ────────────────────────────────────────────
function rpSetupEvents(overlayC) {
  if (rpState._moveH) { window.removeEventListener('mousemove', rpState._moveH); }
  if (rpState._upH)   { window.removeEventListener('mouseup',   rpState._upH);   }

  const getPos = (e) => {
    const rect = overlayC.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const onDown = (e) => {
    e.preventDefault();
    if (!rpState.activeRegionId && rpState.tool !== 'eraser') return;
    const pos = getPos(e);
    if (rpState.tool === 'fill') {
      rpFloodFill(pos.x, pos.y);
      return;
    }
    rpState.painting = true;
    rpState.lastX = pos.x; rpState.lastY = pos.y;
    rpPaintDot(pos.x, pos.y);
  };

  const onMove = (e) => {
    if (!rpState.painting) return;
    const pos = getPos(e);
    rpPaintLine(rpState.lastX, rpState.lastY, pos.x, pos.y);
    rpState.lastX = pos.x; rpState.lastY = pos.y;
  };

  const onUp = () => { rpState.painting = false; };

  overlayC.addEventListener('mousedown', onDown);
  overlayC.addEventListener('touchstart', onDown, {passive:false});
  overlayC.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e); }, {passive:false});
  overlayC.addEventListener('touchend', onUp);

  rpState._moveH = onMove;
  rpState._upH   = onUp;
  window.addEventListener('mousemove', rpState._moveH);
  window.addEventListener('mouseup',   rpState._upH);
}

// ── Paint helpers ─────────────────────────────────────────────
function rpGetActiveCanvas() {
  if (!rpState.activeRegionId) return null;
  const r = rpState.regions.find(r => r.id === rpState.activeRegionId);
  return r ? r.maskCanvas : null;
}

function rpPaintDot(x, y) {
  const mc = rpGetActiveCanvas();
  if (!mc && rpState.tool !== 'eraser') return;
  const size = rpState.brushSize;

  if (rpState.tool === 'eraser') {
    // Erase from ALL region masks at this position
    rpState.regions.forEach(r => {
      const ctx = r.maskCanvas.getContext('2d');
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, size/2, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });
  } else {
    const ctx = mc.getContext('2d');
    const r = rpState.regions.find(r => r.id === rpState.activeRegionId);
    const [cr, cg, cb] = r.colorDef.rgba;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`;
    ctx.beginPath();
    ctx.arc(x, y, size/2, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  rpRedrawOverlay();
}

function rpPaintLine(x1, y1, x2, y2) {
  const mc = rpGetActiveCanvas();
  if (!mc && rpState.tool !== 'eraser') return;
  const size = rpState.brushSize;
  const dist = Math.hypot(x2-x1, y2-y1);
  const steps = Math.max(1, Math.ceil(dist / (size/4)));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    rpPaintDot(x1 + (x2-x1)*t, y1 + (y2-y1)*t);
  }
}

function rpFloodFill(x, y) {
  const mc = rpGetActiveCanvas();
  if (!mc) return;
  const overlayC = document.getElementById('rpOverlayCanvas');
  const W = overlayC.width, H = overlayC.height;
  const r = rpState.regions.find(r => r.id === rpState.activeRegionId);
  const [cr, cg, cb] = r.colorDef.rgba;

  const ctx = mc.getContext('2d');
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  const si = (Math.round(y) * W + Math.round(x)) * 4;
  const tr = data[si], tg = data[si+1], tb = data[si+2], ta = data[si+3];
  if (tr === cr && tg === cg && tb === cb) return;

  const stack = [[Math.round(x), Math.round(y)]];
  const visited = new Uint8Array(W * H);
  visited[Math.round(y)*W + Math.round(x)] = 1;
  const tol = 40;

  while (stack.length) {
    const [px, py] = stack.pop();
    const i = (py * W + px) * 4;
    data[i] = cr; data[i+1] = cg; data[i+2] = cb; data[i+3] = 255;
    for (const [nx, ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]]) {
      if (nx<0||ny<0||nx>=W||ny>=H) continue;
      const ni = ny*W+nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      const ii = ni*4;
      if (Math.abs(data[ii]-tr)<=tol && Math.abs(data[ii+1]-tg)<=tol && Math.abs(data[ii+2]-tb)<=tol && Math.abs(data[ii+3]-ta)<=tol)
        stack.push([nx, ny]);
    }
  }
  ctx.putImageData(imgData, 0, 0);
  rpRedrawOverlay();
}

// ── Overlay redraw ─────────────────────────────────────────────
function rpRedrawOverlay() {
  const overlayC = document.getElementById('rpOverlayCanvas');
  if (!overlayC) return;
  const ctx = overlayC.getContext('2d');
  ctx.clearRect(0, 0, overlayC.width, overlayC.height);

  rpState.regions.forEach(r => {
    if (!r.enabled || !r.maskCanvas) return;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(r.maskCanvas, 0, 0);
  });
  ctx.globalAlpha = 1;

  // Draw active region border hint
  const ar = rpState.regions.find(r => r.id === rpState.activeRegionId);
  if (ar) {
    ctx.strokeStyle = ar.colorDef.hex;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, overlayC.width-2, overlayC.height-2);
  }
}

// ── Region management ─────────────────────────────────────────
function rpAddRegion() {
  const usedIds = rpState.regions.map(r => r.colorDef.id);
  const colorDef = REGION_COLORS.find(c => !usedIds.includes(c.id));
  if (!colorDef) { showToast('error', 'Max Regions', 'Maximum 6 regions reached.'); return; }

  const overlayC = document.getElementById('rpOverlayCanvas');
  const W = overlayC ? overlayC.width  : 512;
  const H = overlayC ? overlayC.height : 512;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W; maskCanvas.height = H;

  const region = {
    id: 'rp_' + Date.now(),
    colorDef,
    prompt: '',
    negPrompt: '',
    strength: 1.0,
    feather: 20,
    enabled: true,
    maskCanvas,
  };
  rpState.regions.push(region);
  rpState.activeRegionId = region.id;
  rpRenderRegions();
  rpRedrawOverlay();

  const btn = document.getElementById('rpAddBtn');
  if (btn) btn.style.display = rpState.regions.length >= 6 ? 'none' : '';
}

function rpRemoveRegion(id) {
  rpState.regions = rpState.regions.filter(r => r.id !== id);
  if (rpState.activeRegionId === id) {
    rpState.activeRegionId = rpState.regions[0]?.id || null;
  }
  rpRenderRegions();
  rpRedrawOverlay();
  const btn = document.getElementById('rpAddBtn');
  if (btn) btn.style.display = rpState.regions.length >= 6 ? 'none' : '';
}

function rpSetActiveRegion(id) {
  rpState.activeRegionId = id;
  rpRenderRegions();
  rpRedrawOverlay();
}

function rpClearAll() {
  const overlayC = document.getElementById('rpOverlayCanvas');
  const W = overlayC?.width || 512, H = overlayC?.height || 512;
  rpState.regions.forEach(r => {
    r.maskCanvas = document.createElement('canvas');
    r.maskCanvas.width = W; r.maskCanvas.height = H;
  });
  rpRedrawOverlay();
}

function rpClearRegion(id) {
  const r = rpState.regions.find(r => r.id === id);
  if (!r) return;
  const W = r.maskCanvas.width, H = r.maskCanvas.height;
  r.maskCanvas = document.createElement('canvas');
  r.maskCanvas.width = W; r.maskCanvas.height = H;
  rpRedrawOverlay();
}

// ── Region list render ────────────────────────────────────────
function rpRenderRegions() {
  const list = document.getElementById('rpRegionList');
  if (!list) return;
  list.innerHTML = '';

  rpState.regions.forEach(region => {
    const isActive = region.id === rpState.activeRegionId;
    const el = document.createElement('div');
    el.className = 'rp-region-item' + (isActive ? ' rp-active' : '');
    el.dataset.id = region.id;

    // Build character link options
    const charOpts = state.characters
      .filter(c => c.enabled && c.keyword)
      .map(c => `<option value="${c.id}">${c.keyword}</option>`)
      .join('');

    el.innerHTML = `
      <div class="rp-region-header" onclick="rpSetActiveRegion('${region.id}')">
        <span class="rp-region-dot" style="background:${region.colorDef.hex}"></span>
        <span class="rp-region-name">${region.colorDef.label}</span>
        <div class="rp-region-header-btns">
          ${charOpts ? `<select class="rp-char-sel" onchange="rpLinkCharacter('${region.id}',this.value)" title="Link a character">
            <option value="">Link character…</option>${charOpts}
          </select>` : ''}
          <button class="rp-region-btn" onclick="event.stopPropagation();rpClearRegion('${region.id}')" title="Clear this region's mask">↺</button>
          <button class="rp-region-btn rp-del-btn" onclick="event.stopPropagation();rpRemoveRegion('${region.id}')" title="Remove region">✕</button>
        </div>
      </div>
      <div class="rp-region-fields" ${isActive ? '' : 'style="display:none"'}>
        <div style="position:relative;margin-bottom:4px">
          <div class="prompt-highlight-layer rp-hl" id="rp-hl-${region.id}" aria-hidden="true"></div>
          <textarea class="rp-prompt-ta" id="rp-pos-${region.id}" rows="2"
            placeholder="Positive prompt for ${region.colorDef.label}…"
            oninput="rpSavePrompt('${region.id}','pos',this.value)">${region.prompt}</textarea>
        </div>
        <div style="position:relative;margin-bottom:6px">
          <div class="prompt-highlight-layer rp-hl" id="rp-hl-neg-${region.id}" aria-hidden="true"></div>
          <textarea class="rp-prompt-ta rp-neg-ta" id="rp-neg-${region.id}" rows="1"
            placeholder="Negative (optional)…"
            oninput="rpSavePrompt('${region.id}','neg',this.value)">${region.negPrompt}</textarea>
        </div>
        <div class="rp-region-sliders">
          <label class="rp-slider-label">Strength
            <input type="range" min="0" max="1" step="0.05" value="${region.strength}"
              oninput="rpState.regions.find(r=>r.id==='${region.id}').strength=parseFloat(this.value);this.nextElementSibling.textContent=parseFloat(this.value).toFixed(2)" />
            <span>${region.strength.toFixed(2)}</span>
          </label>
          <label class="rp-slider-label">Feather
            <input type="range" min="0" max="80" step="1" value="${region.feather}"
              oninput="rpState.regions.find(r=>r.id==='${region.id}').feather=parseInt(this.value);this.nextElementSibling.textContent=this.value" />
            <span>${region.feather}</span>
          </label>
        </div>
      </div>`;
    list.appendChild(el);

    // Wire highlight + autocomplete after appending
    setTimeout(() => {
      rpWireTextarea(`rp-pos-${region.id}`, `rp-hl-${region.id}`);
      rpWireTextarea(`rp-neg-${region.id}`, `rp-hl-neg-${region.id}`);
    }, 0);
  });

  // Global prompt wiring
  rpWireTextarea('rpGlobalPrompt', 'rp-hl-global');
  rpWireTextarea('rpGlobalNegPrompt', 'rp-hl-global-neg');
}

function rpSavePrompt(id, type, val) {
  const r = rpState.regions.find(r => r.id === id);
  if (!r) return;
  if (type === 'pos') r.prompt = val;
  else r.negPrompt = val;
}

function rpLinkCharacter(regionId, charId) {
  if (!charId) return;
  const ch = state.characters.find(c => c.id === charId);
  const r  = rpState.regions.find(r => r.id === regionId);
  if (!ch || !r) return;
  // Build prompt: keyword + character prompt
  const linked = [ch.keyword, ch.prompt].filter(Boolean).join(', ');
  r.prompt = linked;
  const ta = document.getElementById(`rp-pos-${regionId}`);
  if (ta) { ta.value = linked; rpUpdateHL(`rp-pos-${regionId}`, `rp-hl-${regionId}`); }
  showToast('success', 'Character Linked', `${ch.keyword} linked to ${r.colorDef.label}.`);
}

// ── Highlight + autocomplete wiring ───────────────────────────
function rpUpdateHL(taId, hlId) {
  const ta = document.getElementById(taId);
  const hl = document.getElementById(hlId);
  if (!ta || !hl || !state.modifierHighlightEnabled) { if(hl) hl.innerHTML=''; return; }
  hl.innerHTML = escapeHTMLPreserveStructure(ta.value);
  const cs = getComputedStyle(ta);
  hl.style.fontSize = cs.fontSize; hl.style.lineHeight = cs.lineHeight;
  hl.style.fontFamily = cs.fontFamily; hl.style.width = ta.clientWidth + 'px';
  hl.scrollTop = ta.scrollTop;
}

function rpWireTextarea(taId, hlId) {
  const ta = document.getElementById(taId);
  if (!ta || ta._rpWired) return;
  ta._rpWired = true;
  ta.addEventListener('input',  () => rpUpdateHL(taId, hlId));
  ta.addEventListener('scroll', () => { const hl = document.getElementById(hlId); if(hl) hl.scrollTop = ta.scrollTop; });
  rpUpdateHL(taId, hlId);

  if (!state.autocompleteData?.length) return;
  let dropdown = null;
  const hide = () => { if(dropdown){dropdown.remove();dropdown=null;} };
  const show = (matches) => {
    hide();
    if (!matches.length) return;
    dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-list';
    matches.forEach((m,i) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item' + (i===0?' active':'');
      item.textContent = m;
      item.addEventListener('mousedown', e => { e.preventDefault(); accept(m); hide(); });
      dropdown.appendChild(item);
    });
    const rect = ta.getBoundingClientRect();
    dropdown.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom+2}px;width:${rect.width}px;z-index:9999`;
    document.body.appendChild(dropdown);
  };
  const accept = (tag) => {
    const cur = getTagAtCursor(ta);
    if (!cur) return;
    let t = tag;
    if (state.acReplaceUnderscores) t = t.replace(/_/g,' ');
    if (state.acEscapeParens) t = t.replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const s = ta.selectionStart - cur.length;
    ta.value = ta.value.slice(0,s) + t + ta.value.slice(ta.selectionStart);
    ta.selectionStart = ta.selectionEnd = s + t.length;
    rpUpdateHL(taId, hlId);
  };
  ta.addEventListener('input', () => {
    const cur = getTagAtCursor(ta);
    if (!cur||cur.length<2){hide();return;}
    const matches = state.autocompleteData.filter(t=>t.toLowerCase().startsWith(cur.toLowerCase())).slice(0,8);
    if (!matches.length){hide();return;}
    show(matches);
  });
  ta.addEventListener('keydown', e => {
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.autocomplete-item');
    const active = dropdown.querySelector('.autocomplete-item.active');
    let idx = [...items].indexOf(active);
    if (e.key==='ArrowDown'){e.preventDefault();items.forEach((it,i)=>it.classList.toggle('active',i===Math.min(idx+1,items.length-1)));}
    else if (e.key==='ArrowUp'){e.preventDefault();items.forEach((it,i)=>it.classList.toggle('active',i===Math.max(idx-1,0)));}
    else if (e.key==='Enter'||e.key==='Tab'){const a=dropdown.querySelector('.active');if(a){e.preventDefault();accept(a.textContent);hide();}}
    else if (e.key==='Escape') hide();
  });
  ta.addEventListener('blur', () => setTimeout(hide, 150));
}

// ── Tool selector ─────────────────────────────────────────────
function rpSetTool(tool) {
  rpState.tool = tool;
  ['rpToolBrush','rpToolFill','rpToolEraser'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const map = {brush:'rpToolBrush', fill:'rpToolFill', eraser:'rpToolEraser'};
  const el = document.getElementById(map[tool]);
  if (el) el.classList.add('active');
  const ov = document.getElementById('rpOverlayCanvas');
  if (ov) ov.style.cursor = (tool==='fill') ? 'cell' : 'crosshair';
}

function rpUpdateBrush(val) {
  rpState.brushSize = parseInt(val);
  document.getElementById('rpBrushSizeVal').textContent = val;
}

// ── Workflow injection ────────────────────────────────────────
// Returns { positiveCondSrc, negativeCondSrc } after building regional conditioning chain
// ── Node availability detection ───────────────────────────────
async function rpDetectImpactPack() {
  if (rpState.impactPackAvailable !== null) return rpState.impactPackAvailable;
  try {
    const res = await comfyFetch(`${state.comfyUrl}/object_info/RegionalSampler`);
    if (res.ok) {
      const json = await res.json();
      rpState.impactPackAvailable = !!(json && json.RegionalSampler);
    } else {
      rpState.impactPackAvailable = false;
    }
  } catch (e) {
    rpState.impactPackAvailable = false;
  }
  rpUpdatePathIndicator();
  return rpState.impactPackAvailable;
}

async function rpDetectDifferentialDiffusion() {
  if (rpState.differentialDiffusionAvailable !== null) return rpState.differentialDiffusionAvailable;
  try {
    const res = await comfyFetch(`${state.comfyUrl}/object_info/DifferentialDiffusion`);
    if (res.ok) {
      const json = await res.json();
      rpState.differentialDiffusionAvailable = !!(json && json.DifferentialDiffusion);
    } else {
      rpState.differentialDiffusionAvailable = false;
    }
  } catch (e) {
    rpState.differentialDiffusionAvailable = false;
  }
  rpUpdatePathIndicator();
  return rpState.differentialDiffusionAvailable;
}

// Run both detections in parallel, used when panel opens
async function rpDetectAll() {
  await Promise.all([rpDetectImpactPack(), rpDetectDifferentialDiffusion()]);
}

function rpUpdatePathIndicator() {
  const el = document.getElementById('rpPathIndicator');
  if (!el) return;
  // Show the regional pass strategy (independent of Impact Pack)
  if (rpState.differentialDiffusionAvailable === null) {
    el.textContent = '⟡ detecting…';
    el.title = 'Checking available ComfyUI nodes…';
    el.className = 'rp-path-indicator';
  } else if (rpState.differentialDiffusionAvailable) {
    el.textContent = '⟡ Differential Diffusion';
    el.title = 'DifferentialDiffusion detected — global pass then single regional refinement pass';
    el.className = 'rp-path-indicator rp-path-impact';
  } else {
    el.textContent = '⟡ Sequential Inpaint';
    el.title = 'DifferentialDiffusion not found — global pass then sequential per-region inpainting';
    el.className = 'rp-path-indicator rp-path-fallback';
  }
}

// ── Mask upload helper ────────────────────────────────────────
// Applies optional Gaussian feathering, exports the mask canvas as PNG,
// uploads to ComfyUI, and returns the server filename.
async function uploadMaskCanvas(maskCanvas, featherRadius) {
  // Work on a temporary canvas so the original painted mask is never modified
  const tmp = document.createElement('canvas');
  tmp.width  = maskCanvas.width;
  tmp.height = maskCanvas.height;
  const ctx = tmp.getContext('2d');

  if (featherRadius > 0) {
    // Gaussian-approximate feathering via shadowBlur trick:
    // Draw the mask as a white silhouette with a blurred shadow, then composite.
    ctx.clearRect(0, 0, tmp.width, tmp.height);
    // First pass: draw the mask image
    ctx.drawImage(maskCanvas, 0, 0);
    // Second pass: apply blur using filter (widely supported in modern browsers)
    const offBlur = document.createElement('canvas');
    offBlur.width  = tmp.width;
    offBlur.height = tmp.height;
    const bCtx = offBlur.getContext('2d');
    bCtx.filter = `blur(${featherRadius}px)`;
    bCtx.drawImage(maskCanvas, 0, 0);
    bCtx.filter = 'none';
    // Replace tmp with the blurred version
    ctx.clearRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(offBlur, 0, 0);
  } else {
    ctx.drawImage(maskCanvas, 0, 0);
  }

  // Export to PNG blob
  const blob = await new Promise(resolve => tmp.toBlob(resolve, 'image/png'));
  const filename = `rp_mask_${Date.now()}_${Math.random().toString(36).slice(2,7)}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  const fd = new FormData();
  fd.append('image', file, filename);
  const res = await comfyFetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Mask upload failed: ${res.status}`);
  const json = await res.json();
  return json.name;
}

// ── Path A: Impact Pack RegionalSampler ───────────────────────
// Returns a workflow fragment using Impact Pack's RegionalSampler.
// The caller is responsible for replacing the normal KSampler with the
// returned samplerNode + samplerSrc.
// Returns: { samplerNodeId, samplerInputs, posSrc, negSrc }
// where samplerSrc is the [samplerNodeId, 0] output for SaveImage / VAEDecode.
// ── Mask upload helper for a canvas already scaled to gen res ──
async function rpUploadRegionMask(mc, featherRadius, genW, genH) {
  // Scale to generation resolution on a temp canvas
  const scaled = document.createElement('canvas');
  scaled.width = genW; scaled.height = genH;
  scaled.getContext('2d').drawImage(mc, 0, 0, genW, genH);
  return uploadMaskCanvas(scaled, featherRadius);
}

// ── Helper: build composite mask covering ALL regions ─────────
// Used by the Differential Diffusion pass — each pixel's value encodes
// the maximum strength of any region that covers it (0=global, 1=fully regional).
async function rpBuildCompositeMaskName(enabledRegions, genW, genH) {
  const comp = document.createElement('canvas');
  comp.width = genW; comp.height = genH;
  const ctx = comp.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, genW, genH);

  for (const region of enabledRegions) {
    const mc = region.maskCanvas;
    if (!mc || mc.width === 0) continue;
    // Draw region mask at its strength as a white overlay (multiply by strength)
    ctx.globalAlpha = region.strength;
    ctx.drawImage(mc, 0, 0, genW, genH);
  }
  ctx.globalAlpha = 1;
  return uploadMaskCanvas(comp, 0);
}

// ── Path A: Differential Diffusion regional pass ──────────────
// Pass 1 (global) is already emitted by buildWorkflow.
// This function appends Pass 2: a single KSampler that refines all regions
// simultaneously using DifferentialDiffusion for per-pixel denoise weighting.
// Returns the final latent source after the regional pass.
async function rpBuildDifferentialPass(nodes, idFn, globalLatentSrc, modelSrc, clipSrc, vaeSrc, globalPositive, globalNegative, seed, steps, cfg, samplerName, scheduler) {
  const enabledRegions = rpState.regions.filter(r => r.enabled && r.prompt.trim());
  if (!enabledRegions.length) return null;

  const W = state.resW, H = state.resH;

  // Upload the composite mask (encodes per-pixel denoise strength)
  let compMaskName;
  try {
    compMaskName = await rpBuildCompositeMaskName(enabledRegions, W, H);
  } catch (e) {
    console.warn('[RP] Composite mask upload failed:', e);
    return null;
  }

  // LoadImage → ImageToMask for composite mask
  const compLoadId = idFn();
  nodes[compLoadId] = { class_type: 'LoadImage', inputs: { image: compMaskName, upload: 'image' } };
  const compMaskId = idFn();
  nodes[compMaskId] = { class_type: 'ImageToMask', inputs: { image: [compLoadId, 0], channel: 'red' } };

  // DifferentialDiffusion — injects the mask into the model as a denoise map
  const diffDiffId = idFn();
  nodes[diffDiffId] = {
    class_type: 'DifferentialDiffusion',
    inputs: { model: modelSrc }
  };
  const ddModelSrc = [diffDiffId, 0];

  // Build combined regional conditioning: each region's prompt masked to its area
  let combinedPosSrc = null;
  let combinedNegSrc = null;

  for (const region of enabledRegions) {
    const mc = region.maskCanvas;
    if (!mc || mc.width === 0) continue;

    let maskName;
    try {
      maskName = await rpUploadRegionMask(mc, region.feather || 0, W, H);
    } catch (e) {
      console.warn('[RP] Region mask upload failed:', region.id, e);
      continue;
    }

    const loadId = idFn();
    nodes[loadId] = { class_type: 'LoadImage', inputs: { image: maskName, upload: 'image' } };
    const maskId = idFn();
    nodes[maskId] = { class_type: 'ImageToMask', inputs: { image: [loadId, 0], channel: 'red' } };

    const rPosId = idFn();
    nodes[rPosId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: region.prompt } };
    const rNegId = idFn();
    nodes[rNegId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: region.negPrompt.trim() || globalNegative } };

    const setPosId = idFn();
    nodes[setPosId] = { class_type: 'ConditioningSetMask', inputs: { conditioning: [rPosId, 0], mask: [maskId, 0], strength: region.strength, set_cond_area: 'default' } };
    const setNegId = idFn();
    nodes[setNegId] = { class_type: 'ConditioningSetMask', inputs: { conditioning: [rNegId, 0], mask: [maskId, 0], strength: region.strength, set_cond_area: 'default' } };

    if (combinedPosSrc === null) {
      combinedPosSrc = [setPosId, 0];
      combinedNegSrc = [setNegId, 0];
    } else {
      const cpId = idFn();
      nodes[cpId] = { class_type: 'ConditioningCombine', inputs: { conditioning_1: combinedPosSrc, conditioning_2: [setPosId, 0] } };
      combinedPosSrc = [cpId, 0];
      const cnId = idFn();
      nodes[cnId] = { class_type: 'ConditioningCombine', inputs: { conditioning_1: combinedNegSrc, conditioning_2: [setNegId, 0] } };
      combinedNegSrc = [cnId, 0];
    }
  }

  // Also blend in global prompt at low strength so unpainted areas stay coherent
  if (globalPositive.trim() && combinedPosSrc !== null) {
    const bgPosId = idFn();
    nodes[bgPosId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: globalPositive } };
    const bgNegId = idFn();
    nodes[bgNegId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: globalNegative } };
    const cpId = idFn();
    nodes[cpId] = { class_type: 'ConditioningCombine', inputs: { conditioning_1: combinedPosSrc, conditioning_2: [bgPosId, 0] } };
    combinedPosSrc = [cpId, 0];
    const cnId = idFn();
    nodes[cnId] = { class_type: 'ConditioningCombine', inputs: { conditioning_1: combinedNegSrc, conditioning_2: [bgNegId, 0] } };
    combinedNegSrc = [cnId, 0];
  }

  if (combinedPosSrc === null) return null;

  // SetLatentNoiseMask — tells KSampler which pixels to re-denoise (driven by composite mask)
  const slnmId = idFn();
  nodes[slnmId] = { class_type: 'SetLatentNoiseMask', inputs: { samples: globalLatentSrc, mask: [compMaskId, 0] } };

  // Regional KSampler pass — uses DifferentialDiffusion model, masked latent
  const ksRegId = idFn();
  nodes[ksRegId] = {
    class_type: 'KSampler',
    inputs: {
      model: ddModelSrc,
      positive: combinedPosSrc,
      negative: combinedNegSrc,
      latent_image: [slnmId, 0],
      seed: seed + 1,  // offset so it differs from global pass
      steps,
      cfg,
      sampler_name: samplerName,
      scheduler,
      denoise: 1.0,    // DifferentialDiffusion controls per-pixel denoise via mask
    }
  };

  return [ksRegId, 0];
}

// ── Path B: Sequential regional inpainting ────────────────────
// Pass 1 (global) is already emitted by buildWorkflow.
// This function appends one KSampler per region, chained so each pass
// sees the results of all previous regions (preserving context coherence).
// Returns the final latent source after all regional passes.
async function rpBuildSequentialPass(nodes, idFn, globalLatentSrc, modelSrc, clipSrc, globalNegative, seed, steps, cfg, samplerName, scheduler) {
  const enabledRegions = rpState.regions.filter(r => r.enabled && r.prompt.trim());
  if (!enabledRegions.length) return null;

  const W = state.resW, H = state.resH;
  let latentSrc = globalLatentSrc;

  for (let i = 0; i < enabledRegions.length; i++) {
    const region = enabledRegions[i];
    const mc = region.maskCanvas;
    if (!mc || mc.width === 0) continue;

    let maskName;
    try {
      maskName = await rpUploadRegionMask(mc, region.feather || 0, W, H);
    } catch (e) {
      console.warn('[RP] Region mask upload failed, skipping:', region.id, e);
      continue;
    }

    const loadId = idFn();
    nodes[loadId] = { class_type: 'LoadImage', inputs: { image: maskName, upload: 'image' } };
    const maskId = idFn();
    nodes[maskId] = { class_type: 'ImageToMask', inputs: { image: [loadId, 0], channel: 'red' } };

    // SetLatentNoiseMask — restrict sampling to this region's mask
    const slnmId = idFn();
    nodes[slnmId] = { class_type: 'SetLatentNoiseMask', inputs: { samples: latentSrc, mask: [maskId, 0] } };

    // Region-specific conditioning
    const rPosId = idFn();
    nodes[rPosId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: region.prompt } };
    const rNegId = idFn();
    nodes[rNegId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: region.negPrompt.trim() || globalNegative } };

    // KSampler for this region — denoise = region.strength so the user's slider
    // directly controls how much the region departs from the global base.
    const ksId = idFn();
    nodes[ksId] = {
      class_type: 'KSampler',
      inputs: {
        model: modelSrc,
        positive: [rPosId, 0],
        negative: [rNegId, 0],
        latent_image: [slnmId, 0],
        seed: seed + i + 1,   // unique seed per region, offset from global
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise: region.strength,
      }
    };

    latentSrc = [ksId, 0];
  }

  return latentSrc;
}

// ── Main regional workflow builder ────────────────────────────
// Called from buildWorkflow after the global KSampler is constructed.
// Takes the global KSampler's latent output and appends the regional pass.
// Returns the final latent src that VAEDecode should read from,
// or null if no regional pass was possible (caller uses global ksId as-is).
async function buildRegionalInpaintPass(nodes, idFn, globalLatentSrc, modelSrc, clipSrc, vaeSrc, globalPositive, globalNegative, seed, steps, cfg, samplerName, scheduler) {
  const enabledRegions = rpState.regions.filter(r => r.enabled && r.prompt.trim());
  if (!enabledRegions.length) return null;

  // Ensure detection has completed (usually already cached from panel open)
  await rpDetectDifferentialDiffusion();

  if (rpState.differentialDiffusionAvailable) {
    try {
      const latSrc = await rpBuildDifferentialPass(nodes, idFn, globalLatentSrc, modelSrc, clipSrc, vaeSrc, globalPositive, globalNegative, seed, steps, cfg, samplerName, scheduler);
      if (latSrc) return latSrc;
    } catch (e) {
      console.warn('[RP] DifferentialDiffusion pass failed, falling back to sequential:', e);
    }
  }

  // Sequential fallback
  try {
    const latSrc = await rpBuildSequentialPass(nodes, idFn, globalLatentSrc, modelSrc, clipSrc, globalNegative, seed, steps, cfg, samplerName, scheduler);
    if (latSrc) return latSrc;
  } catch (e) {
    console.warn('[RP] Sequential inpaint pass failed:', e);
  }

  return null;
}

// Get bounding box of painted pixels in a mask canvas (kept for any legacy uses)
function rpGetMaskBounds(mc, W, H) {
  const ctx = mc.getContext('2d');
  const data = ctx.getImageData(0, 0, mc.width, mc.height).data;
  let minX=mc.width, minY=mc.height, maxX=0, maxY=0, found=false;
  for (let y=0; y<mc.height; y++) {
    for (let x=0; x<mc.width; x++) {
      if (data[(y*mc.width+x)*4+3] > 10) {
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
        found = true;
      }
    }
  }
  if (!found) return null;
  return { x:minX, y:minY, w:maxX-minX+1, h:maxY-minY+1 };
}

// ── Generate with regions ─────────────────────────────────────
function rpGenerate() {
  closeRegionalPrompt();
  // Trigger main generate — buildWorkflow will pick up rpState
  generate();
}

// Get bounding box of painted pixels in a mask canvas (used by Path C fallback)
function rpGetMaskBounds(mc, W, H) {
  const ctx = mc.getContext('2d');
  const data = ctx.getImageData(0, 0, mc.width, mc.height).data;
  let minX=mc.width, minY=mc.height, maxX=0, maxY=0, found=false;
  for (let y=0; y<mc.height; y++) {
    for (let x=0; x<mc.width; x++) {
      if (data[(y*mc.width+x)*4+3] > 10) {
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
        found = true;
      }
    }
  }
  if (!found) return null;
  return { x:minX, y:minY, w:maxX-minX+1, h:maxY-minY+1 };
}

// ── Generate with regions ─────────────────────────────────────
function rpGenerate() {
  closeRegionalPrompt();
  // Trigger main generate — buildWorkflow will pick up rpState
  generate();
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('comfyStudioRP') === 'true';
  if (saved) {
    rpState.enabled = true;
    const tog = document.getElementById('regionalPromptToggle');
    if (tog) tog.checked = true;
    const btn = document.getElementById('actionRegionalBtn');
    if (btn) btn.style.display = '';
  }
});

function _initCompGrid() {
  const tog = document.getElementById('cgToggle');
  const btn = document.getElementById('actionCompGridBtn');
  if (!tog || !btn) return;
  if (localStorage.getItem('comfyStudioCG') === 'true') {
    btn.style.display = '';
    tog.checked = true;
  }
  tog.addEventListener('change', function() {
    btn.style.display = this.checked ? '' : 'none';
    if (!this.checked && cg.open) toggleCompGridPanel();
    localStorage.setItem('comfyStudioCG', this.checked);
  });
  document.getElementById('cgSendAll')?.addEventListener('change', function() {
    cg.sendAll = this.checked;
  });
}
document.addEventListener('DOMContentLoaded', _initCompGrid);
// ═══════════════════════════════════════════════════════════════════════════
// IMAGE CAPTIONING
// ═══════════════════════════════════════════════════════════════════════════

state.captionEnabled = false;
state.captionMode    = 'tags';  // 'tags' | 'natural'
state.captionImageFile    = null;
state.captionImageDataUrl = null;
state.captionImageName    = null; // ComfyUI server-side name after upload

// ── Toggle ────────────────────────────────────────────────────────────────
function toggleCaptionFeature(enabled) {
  state.captionEnabled = enabled;
  localStorage.setItem('comfyStudioCaption', enabled);
  const card = document.getElementById('captionCard');
  if (card) card.style.display = enabled ? '' : 'none';
  const btn = document.getElementById('actionCaptionBtn');
  if (btn) btn.style.display = enabled ? '' : 'none';
}

// ── Mode switch ───────────────────────────────────────────────────────────
function setCaptionMode(mode, btn) {
  state.captionMode = mode;
  document.getElementById('captionTagsOptions').style.display    = mode === 'tags'    ? '' : 'none';
  document.getElementById('captionNaturalOptions').style.display = mode === 'natural' ? '' : 'none';
  document.querySelectorAll('#captionModeTagsBtn, #captionModeLangBtn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── Image upload ──────────────────────────────────────────────────────────
function handleCaptionImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.captionImageFile    = file;
    state.captionImageDataUrl = e.target.result;
    document.getElementById('captionPreviewImg').src = e.target.result;
    document.getElementById('captionPreviewWrap').style.display = '';
    document.getElementById('captionDropHint').style.display    = 'none';
    // Upload to ComfyUI asynchronously
    uploadImageToComfy(file, name => { state.captionImageName = name; });
  };
  reader.readAsDataURL(file);
}

function clearCaptionImage(e) {
  e.stopPropagation();
  state.captionImageFile    = null;
  state.captionImageDataUrl = null;
  state.captionImageName    = null;
  document.getElementById('captionPreviewImg').src = '';
  document.getElementById('captionPreviewWrap').style.display = 'none';
  document.getElementById('captionDropHint').style.display    = '';
  document.getElementById('captionImageInput').value = '';
}

// ── Use current output image ───────────────────────────────────────────────
async function captionUseCurrentImage() {
  if (!state.currentImageUrl) { showToast('info', 'No image', 'Generate an image first.', 3000); return; }
  try {
    const resp = await fetch(state.currentImageUrl);
    const blob = await resp.blob();
    const file = new File([blob], 'caption_src.png', { type: 'image/png' });
    const dataUrl = URL.createObjectURL(blob);
    state.captionImageFile    = file;
    state.captionImageDataUrl = dataUrl;
    document.getElementById('captionPreviewImg').src = dataUrl;
    document.getElementById('captionPreviewWrap').style.display = '';
    document.getElementById('captionDropHint').style.display    = 'none';
    uploadImageToComfy(file, name => { state.captionImageName = name; });
    showToast('success', 'Image set', 'Current image loaded for captioning.', 2500);
  } catch(e) {
    showToast('error', 'Failed', 'Could not load current image: ' + e.message, 4000);
  }
}

// Button in image action bar → set current image then open card
async function captionCurrentImageFromBar() {
  if (!state.captionEnabled) return;
  await captionUseCurrentImage();
  // Scroll to and expand caption card
  const card = document.getElementById('captionCard');
  if (card) {
    card.classList.remove('collapsed');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Send result to positive prompt ────────────────────────────────────────
function captionSendToPrompt() {
  const raw = document.getElementById('captionResultText')?.value?.trim();
  if (!raw) return;
  const ta = document.getElementById('positivePrompt');
  if (!ta) return;
  // Replace underscores with spaces and escape parentheses for ComfyUI prompt syntax
  const result = raw
    .replace(/_/g, ' ')
    .replace(/\(/g, '\(')
    .replace(/\)/g, '\)');
  const current = ta.value.trim();
  ta.value = current ? current + ', ' + result : result;
  updatePromptHighlight('positive');
  showToast('success', 'Sent to Prompt', 'Caption result appended to positive prompt.', 2500);
}

// ── Run captioning ────────────────────────────────────────────────────────
async function runCaption() {
  if (!state.captionImageName && !state.captionImageFile) {
    showToast('error', 'No image', 'Please upload an image or use the current generated image.', 3000);
    return;
  }

  const statusWrap  = document.getElementById('captionStatusWrap');
  const resultWrap  = document.getElementById('captionResultWrap');
  const resultTA    = document.getElementById('captionResultText');
  const runBtn      = document.getElementById('captionRunBtn');

  // Upload first if we have a file but no server name yet
  if (!state.captionImageName && state.captionImageFile) {
    setCaptionStatus('Uploading image…');
    try {
      await new Promise((resolve, reject) => {
        uploadImageToComfy(state.captionImageFile, name => {
          state.captionImageName = name;
          resolve();
        });
        setTimeout(() => reject(new Error('Upload timeout')), 15000);
      });
    } catch(e) {
      setCaptionStatus('Upload failed: ' + e.message, true);
      return;
    }
  }

  runBtn.disabled = true;
  resultWrap.style.display = 'none';
  setCaptionStatus('Building workflow…');

  try {
    let workflow;
    if (state.captionMode === 'tags') {
      workflow = buildWD14Workflow(state.captionImageName);
    } else {
      workflow = buildJoyCaptionWorkflow(state.captionImageName);
    }

    setCaptionStatus('Sending to ComfyUI…');
    const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: state.clientId })
    });
    if (!res.ok) throw new Error(await res.text());
    const { prompt_id } = await res.json();

    setCaptionStatus('Running model…');
    const result = await pollCaptionResult(prompt_id);

    resultTA.value = result;
    resultWrap.style.display = '';
    statusWrap.style.display = 'none';
    showToast('success', 'Caption Ready', 'Image captioned successfully.', 2500);
  } catch(e) {
    const msg = e.message || String(e);
    // Only show "node not found" if the error explicitly says the class_type is unknown
    if (msg.includes('class_type') && msg.toLowerCase().includes('not found')) {
      setCaptionStatus('⚠ Node not found. Install fpgaminer/joycaption_comfyui (https://github.com/fpgaminer/joycaption_comfyui) and restart ComfyUI.', true);
    } else {
      setCaptionStatus('Error: ' + msg, true);
    }
    console.error('Caption error:', e);
  } finally {
    runBtn.disabled = false;
  }
}

function setCaptionStatus(msg, isError) {
  const w = document.getElementById('captionStatusWrap');
  if (!w) return;
  w.style.display = '';
  w.textContent   = msg;
  w.style.color   = isError ? 'var(--negative)' : 'var(--text-mid)';
}

// ── WD14 Tagger workflow ───────────────────────────────────────────────────
// Uses ComfyUI-WD14-Tagger custom node (WD14Tagger)
// No NSFW filtering — threshold is the only gate
function buildWD14Workflow(imageName) {
  const model     = document.getElementById('captionWd14Model')?.value || 'wd-v1-4-moat-tagger-v2';
  const threshold = parseFloat(document.getElementById('captionThresholdNum')?.value) || 0.35;

  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: imageName, upload: "image" }
    },
    "2": {
      class_type: "WD14Tagger|pysssss",
      inputs: {
        image:      ["1", 0],
        model:      model,
        threshold:  threshold,
        character_threshold: threshold,
        exclude_tags: "",    // no exclusions — no NSFW filter
        replace_underscore: false,
        trailing_comma:     false,
        cumulative:         false,
      }
    },
    // ShowText|pysssss is a valid ComfyUI output node (from pythongosssss/ComfyUI-Custom-Scripts,
    // same package as WD14Tagger — already a required dependency).
    // ComfyUI rejects any workflow with no output node (prompt_no_outputs error).
    "3": {
      class_type: "ShowText|pysssss",
      inputs: { text: ["2", 0] }
    }
  };
}

// ── JoyCaption workflow ────────────────────────────────────────────────────
// Uses fpgaminer/joycaption_comfyui (https://github.com/fpgaminer/joycaption_comfyui)
// Node "0": JJC_DownloadAndLoadJoyCaptionModel — loads/downloads the model object.
// Node "1": LoadImage — loads the input image.
// Node "2": JJC_JoyCaption — runs captioning, takes model object from node 0.
// Node "3": ShowText|pysssss — required output node.
function buildJoyCaptionWorkflow(imageName) {
  const captionType = document.getElementById('captionNaturalModel')?.value || 'Descriptive';
  const captionLen  = document.getElementById('captionJoyLength')?.value   || 'medium-length';
  const personName  = document.getElementById('captionJoyPersonName')?.value || '';

  return {
    // Loader node — loads/downloads the JoyCaption model
    "0": {
      class_type: "JJC_DownloadAndLoadJoyCaptionModel",
      inputs: {
        model:       "fancyfeast/llama-joycaption-alpha-two-hf-llava",
        memory_mode: "Default",
        keep_loaded: false,
      }
    },
    "1": {
      class_type: "LoadImage",
      inputs: { image: imageName, upload: "image" }
    },
    // JJC_JoyCaption — model is a node link to the loader output, not a string
    "2": {
      class_type: "JJC_JoyCaption",
      inputs: {
        model:          ["0", 0],
        image:          ["1", 0],
        caption_type:   captionType,
        caption_length: captionLen,
        person_name:    personName,
        extra_option1:  "",
        extra_option2:  "",
        extra_option3:  "",
        extra_option4:  "",
        extra_option5:  "",
        max_new_tokens: 512,
        temperature:    0.6,
        top_p:          0.9,
        top_k:          0,
      }
    },
    // ShowText|pysssss — required output node; JJC_JoyCaption output index 1 is the caption string
    "3": {
      class_type: "ShowText|pysssss",
      inputs: { text: ["2", 1] }
    }
  };
}

// ── Poll ComfyUI history for caption result ───────────────────────────────
// The WD14Tagger/BLIP nodes return their output as the first output of the
// text node. We read it from /history/{prompt_id}.
async function pollCaptionResult(promptId, maxWait = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(1200);
    try {
      const res = await comfyFetch(`${state.comfyUrl}/history/${promptId}`);
      if (!res.ok) continue;
      const hist = await res.json();
      const entry = hist[promptId];
      if (!entry) continue;
      if (entry.status?.completed === false && !entry.status?.status_str) continue;

      // Check for execution error
      if (entry.status?.status_str === 'error') {
        const errDetails = entry.status?.messages?.find(m => m[0] === 'execution_error');
        const errMsg = errDetails?.[1]?.exception_message || 'Execution error';
        throw new Error(errMsg);
      }

      // Try to extract text output from any node that produced text.
      // Priority: JJC_JoyCaption node "2" first (caption key), then WD14 (tags key).
      // Deliberately skip node "3" (ShowText) — it echoes the input prompt, not the caption.
      const outputs = entry.outputs || {};
      console.log('[Caption] raw outputs:', JSON.stringify(outputs));

      // 1. Look for caption key on any node except the ShowText node ("3")
      for (const nodeId of Object.keys(outputs)) {
        if (nodeId === '3') continue; // skip ShowText — it returns the prompt text
        const out = outputs[nodeId];
        if (typeof out.caption === 'string' && out.caption.trim()) return out.caption.trim();
        if (Array.isArray(out.caption) && out.caption[0]) return String(out.caption[0]).trim();
      }
      // 2. WD14Tagger tags key
      for (const nodeId of Object.keys(outputs)) {
        const out = outputs[nodeId];
        if (typeof out.tags === 'string' && out.tags.trim()) return out.tags.trim();
        if (Array.isArray(out.tags) && out.tags[0]) return String(out.tags[0]).trim();
      }
      // 3. Generic text key, skip ShowText node for other nodes first
      for (const nodeId of Object.keys(outputs)) {
        if (nodeId === '3') continue;
        const out = outputs[nodeId];
        if (typeof out.text === 'string' && out.text.trim()) return out.text.trim();
        if (Array.isArray(out.text) && out.text[0]) return String(out.text[0]).trim();
        if (out.text_content) return String(out.text_content).trim();
      }
      // 4. Last resort: read ShowText node output, but reject if it looks like a raw prompt
      //    (JJC_JoyCaption passes the caption through ShowText as its only history output)
      const showOut = outputs['3'];
      if (showOut) {
        const candidate = Array.isArray(showOut.text) ? String(showOut.text[0]) : String(showOut.text || '');
        const looksLikePrompt = candidate.startsWith('Write ') || candidate.startsWith('Please ') || candidate.startsWith('Describe ') || candidate.startsWith('Generate ');
        if (candidate.trim() && !looksLikePrompt) return candidate.trim();
      }

      // If completed but no text found, it ran OK but the node output format differs
      if (entry.status?.completed) {
        throw new Error('Caption completed but no text output found. Check that the required custom node is installed and working correctly.');
      }
    } catch(e) {
      if (e.message && !e.message.includes('fetch')) throw e;
    }
  }
  throw new Error('Caption timed out after ' + Math.round(maxWait/1000) + 's');
}

// ── Init caption feature from localStorage ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedCaption = localStorage.getItem('comfyStudioCaption') === 'true';
  if (savedCaption) {
    state.captionEnabled = true;
    const tog = document.getElementById('captionToggle');
    if (tog) tog.checked = true;
    const card = document.getElementById('captionCard');
    if (card) card.style.display = '';
    const btn = document.getElementById('actionCaptionBtn');
    if (btn) btn.style.display = '';
  }

  // Restore caption mode
  const savedCaptionMode = localStorage.getItem('comfyStudioCaptionMode');
  if (savedCaptionMode) {
    const modeBtn = savedCaptionMode === 'natural'
      ? document.getElementById('captionModeLangBtn')
      : document.getElementById('captionModeTagsBtn');
    if (modeBtn) setCaptionMode(savedCaptionMode, modeBtn);
  }
});
// ════════════════════════════════════════════════════════════════════
// CUSTOM WORKFLOW
// ════════════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────────
const cwfState = {
  workflow: null,   // parsed JSON object
  name: '',         // filename without .json
  overrideEnabled: false,
  // detected editable fields: [{ groupLabel, fields: [{ nodeId, inputKey, type, label, taId?, layerId? }] }]
  groups: [],
};

// ── Panel mode switch ──────────────────────────────────────────────
function switchPanelMode(mode, btn) {
  document.querySelectorAll('.panel-mode-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const isWorkflow = mode === 'workflow';
  document.getElementById('panelScrollGenerate').style.display   = isWorkflow ? 'none' : '';
  document.getElementById('panelScrollWorkflow').style.display   = isWorkflow ? '' : 'none';
  document.getElementById('panelFooterGenerate').style.display   = isWorkflow ? 'none' : '';
  document.getElementById('panelFooterWorkflow').style.display   = isWorkflow ? '' : 'none';
}

// ── Drop zone ──────────────────────────────────────────────────────
function cwfDragOver(e) {
  e.preventDefault();
  document.getElementById('cwfDropzone').classList.add('drag-over');
}
function cwfDragLeave() {
  document.getElementById('cwfDropzone').classList.remove('drag-over');
}
function cwfDrop(e) {
  e.preventDefault();
  cwfDragLeave();
  const file = e.dataTransfer.files[0];
  if (file) cwfLoadFile(file);
}
function cwfFileSelected(input) {
  if (input.files[0]) cwfLoadFile(input.files[0]);
}

// Click on dropzone opens file picker
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('cwfDropzone');
  if (dz) dz.addEventListener('click', () => document.getElementById('cwfFileInput').click());

  // Restore from localStorage
  const saved = localStorage.getItem('comfyStudioCWF');
  if (saved) {
    try {
      const { name, workflow } = JSON.parse(saved);
      cwfState.name = name;
      cwfState.workflow = workflow;
      cwfApplyLoaded();
    } catch(e) {}
  }
});

function cwfLoadFile(file) {
  if (!file.name.endsWith('.json')) {
    showToast('error', 'Invalid file', 'Please drop a ComfyUI API-format .json workflow.', 3000);
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wf = JSON.parse(e.target.result);
      cwfState.workflow = wf;
      cwfState.name = file.name.replace(/\.json$/i, '');
      localStorage.setItem('comfyStudioCWF', JSON.stringify({ name: cwfState.name, workflow: wf }));
      cwfApplyLoaded();
      showToast('success', 'Workflow loaded', cwfState.name, 2500);
    } catch(err) {
      showToast('error', 'Parse error', 'Could not parse JSON. Make sure you exported as API format from ComfyUI.', 4000);
    }
  };
  reader.readAsText(file);
}

function cwfApplyLoaded() {
  document.getElementById('cwfDropzone').style.display = 'none';
  document.getElementById('cwfLoadedRow').style.display = '';
  document.getElementById('cwfLoadedName').textContent = cwfState.name;
  document.getElementById('cwfOverrideCard').style.display = '';
  cwfDetectFields();
  // Re-render if override already on
  if (cwfState.overrideEnabled) cwfRenderOverrideInputs();
}

function cwfClear() {
  cwfState.workflow = null;
  cwfState.name = '';
  cwfState.groups = [];
  cwfState.overrideEnabled = false;
  localStorage.removeItem('comfyStudioCWF');
  document.getElementById('cwfDropzone').style.display = '';
  document.getElementById('cwfLoadedRow').style.display = 'none';
  document.getElementById('cwfOverrideCard').style.display = 'none';
  document.getElementById('cwfOverrideToggle').checked = false;
  document.getElementById('cwfOverrideInputs').style.display = 'none';
  document.getElementById('cwfOverrideInputs').innerHTML = '';
  document.getElementById('cwfFileInput').value = '';
}

// ── Field detection ────────────────────────────────────────────────
// Scans the workflow for nodes that have editable text/seed inputs.
// Groups by sampler node when possible; ungrouped nodes go into a General group.
function cwfDetectFields() {
  const wf = cwfState.workflow;
  if (!wf) return;

  // Sampler node types and their seed input key
  const SAMPLER_TYPES = {
    'KSampler':         'seed',
    'KSamplerAdvanced': 'noise_seed',
    'SamplerCustom':    'noise_seed',
    'SamplerCustomAdvanced': null, // seed comes from separate node
  };
  const TEXT_ENCODE_TYPES = new Set(['CLIPTextEncode', 'CLIPTextEncodeFlux', 'CLIPTextEncodeSD3']);

  // Build a map of nodeId -> node
  const nodes = wf;

  // For each sampler, collect its connected text encoders
  const samplerGroups = [];
  const claimedTextNodes = new Set();

  const samplerIds = Object.keys(nodes).filter(id => SAMPLER_TYPES.hasOwnProperty(nodes[id].class_type));

  samplerIds.forEach(sid => {
    const sampler = nodes[sid];
    const seedKey = SAMPLER_TYPES[sampler.class_type];
    const fields = [];

    // Trace positive / negative conditioning back to text encoders
    ['positive', 'negative'].forEach(cond => {
      let src = sampler.inputs?.[cond];
      // Follow chain — conditioning may go through ConditioningCombine, ControlNetApply, etc.
      const visited = new Set();
      while (Array.isArray(src) && !visited.has(src[0])) {
        visited.add(src[0]);
        const srcNode = nodes[src[0]];
        if (!srcNode) break;
        if (TEXT_ENCODE_TYPES.has(srcNode.class_type)) {
          const textVal = srcNode.inputs?.text ?? '';
          if (!claimedTextNodes.has(src[0])) {
            claimedTextNodes.add(src[0]);
            fields.push({ nodeId: src[0], inputKey: 'text', type: 'textarea', label: cond === 'positive' ? 'Positive Prompt' : 'Negative Prompt', defaultVal: textVal });
          }
          break;
        }
        // Try to follow the first link input of this node to keep tracing
        const nextSrc = Object.values(srcNode.inputs || {}).find(v => Array.isArray(v));
        src = nextSrc || null;
      }
    });

    // Seed
    if (seedKey && sampler.inputs?.[seedKey] !== undefined) {
      fields.push({ nodeId: sid, inputKey: seedKey, type: 'seed', label: 'Seed', defaultVal: sampler.inputs[seedKey] });
    }

    if (fields.length) {
      const label = samplerIds.length > 1 ? `${sampler.class_type} (node ${sid})` : sampler.class_type;
      samplerGroups.push({ groupLabel: label, fields });
    }
  });

  // Any CLIPTextEncode nodes not yet claimed go into a General group
  const unclaimed = Object.keys(nodes).filter(id =>
    TEXT_ENCODE_TYPES.has(nodes[id].class_type) && !claimedTextNodes.has(id)
  );
  const generalFields = unclaimed.map(id => ({
    nodeId: id,
    inputKey: 'text',
    type: 'textarea',
    label: `Text (node ${id})`,
    defaultVal: nodes[id].inputs?.text ?? '',
  }));

  cwfState.groups = samplerGroups;
  if (generalFields.length) cwfState.groups.push({ groupLabel: 'Other Text Nodes', fields: generalFields });
}

// ── Override toggle + render ───────────────────────────────────────
function cwfToggleOverride(enabled) {
  cwfState.overrideEnabled = enabled;
  const wrap = document.getElementById('cwfOverrideInputs');
  wrap.style.display = enabled ? '' : 'none';
  if (enabled) cwfRenderOverrideInputs();
}

function cwfRenderOverrideInputs() {
  const wrap = document.getElementById('cwfOverrideInputs');
  wrap.innerHTML = '';

  if (!cwfState.groups.length) {
    wrap.innerHTML = '<p style="font-size:11px;color:var(--text-lo);margin:0">No editable text or seed inputs detected in this workflow.</p>';
    return;
  }

  cwfState.groups.forEach((group, gi) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'cwf-group';

    const title = document.createElement('div');
    title.className = 'cwf-group-title';
    title.textContent = group.groupLabel;
    groupEl.appendChild(title);

    group.fields.forEach((field, fi) => {
      const fieldId = `cwf_field_${gi}_${fi}`;
      const layerId = `cwf_layer_${gi}_${fi}`;

      const labelEl = document.createElement('div');
      labelEl.className = 'cwf-field-label';
      labelEl.textContent = field.label;
      groupEl.appendChild(labelEl);

      if (field.type === 'textarea') {
        const promptWrap = document.createElement('div');
        promptWrap.className = 'char-prompt-wrap';
        promptWrap.style.position = 'relative';

        const layer = document.createElement('div');
        layer.className = 'prompt-highlight-layer char-highlight-layer';
        layer.id = layerId;
        layer.setAttribute('aria-hidden', 'true');

        const ta = document.createElement('textarea');
        ta.className = 'prompt-ta qtag-ta';
        ta.id = fieldId;
        ta.rows = 3;
        ta.value = field.defaultVal;
        ta.style.width = '100%';
        ta.placeholder = field.label;

        ta.addEventListener('input', () => updateCharHighlight(ta));
        ta.addEventListener('scroll', () => syncCharHighlightScroll(ta));

        promptWrap.appendChild(layer);
        promptWrap.appendChild(ta);
        groupEl.appendChild(promptWrap);

        // Register autocomplete
        setupCharAutocomplete(ta);
        // Store id for run-time value reading
        field.taId = fieldId;

      } else if (field.type === 'seed') {
        const seedRow = document.createElement('div');
        seedRow.className = 'cwf-seed-row';

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.className = 'num-input';
        numInput.id = fieldId;
        numInput.value = field.defaultVal;
        numInput.min = -1;
        numInput.max = 2**32;
        numInput.step = 1;
        numInput.style.flex = '1';

        const randBtn = document.createElement('button');
        randBtn.className = 'icon-btn';
        randBtn.title = 'Randomize';
        randBtn.textContent = '⚄';
        randBtn.addEventListener('click', () => {
          numInput.value = Math.floor(Math.random() * 2**32);
        });

        seedRow.appendChild(numInput);
        seedRow.appendChild(randBtn);
        groupEl.appendChild(seedRow);
        field.taId = fieldId;
      }
    });

    wrap.appendChild(groupEl);
  });

  // Trigger initial highlight for all textareas
  wrap.querySelectorAll('textarea').forEach(ta => updateCharHighlight(ta));
}

// ── Run ────────────────────────────────────────────────────────────
async function cwfRun() {
  if (!cwfState.workflow) {
    showToast('error', 'No workflow', 'Import a workflow JSON first.', 3000);
    return;
  }

  // Deep clone so we don't mutate the stored workflow
  const wf = JSON.parse(JSON.stringify(cwfState.workflow));

  // Apply overrides if enabled
  if (cwfState.overrideEnabled) {
    cwfState.groups.forEach(group => {
      group.fields.forEach(field => {
        if (!field.taId) return;
        const el = document.getElementById(field.taId);
        if (!el) return;
        const val = field.type === 'seed' ? parseInt(el.value) : el.value;
        if (wf[field.nodeId] && wf[field.nodeId].inputs) {
          wf[field.nodeId].inputs[field.inputKey] = val;
        }
      });
    });
  }

  const runBtn = document.getElementById('cwfRunBtn');
  runBtn.disabled = true;
  showGenOverlay(true);
  document.getElementById('genOverlayText').textContent = 'Running workflow…';

  try {
    const res = await comfyFetch(`${state.comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: wf, client_id: state.clientId }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { prompt_id } = await res.json();
    state.lastPromptId = prompt_id;
    state.batchTotal = 1;
    state.batchCurrent = 0;
    await pollForImages(prompt_id, 1);
  } catch(e) {
    showGenOverlay(false);
    clearProgress();
    showToast('error', 'Workflow Error', e.message || String(e), 6000);
    console.error('[CWF] run error:', e);
  } finally {
    runBtn.disabled = false;
  }
}
// ════════════════════════════════════════════════════════════════════
// SHARE / CLOUDFLARE TUNNEL
// ════════════════════════════════════════════════════════════════════

const sharePollingInterval = { id: null };

function shareStart() {
  const username = document.getElementById('shareUsername').value.trim();
  const password = document.getElementById('sharePassword').value;

  if (!username) {
    showToast('error', 'Missing username', 'Enter a username before starting.', 3000);
    return;
  }
  if (password.length < 4) {
    showToast('error', 'Password too short', 'Use at least 4 characters.', 3000);
    return;
  }

  const btn = document.getElementById('shareStartBtn');
  btn.disabled = true;
  btn.textContent = 'Starting…';

  fetch('/share/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      shareSetRunningUI(true);
      shareStartPolling();
    })
    .catch(e => {
      btn.disabled = false;
      btn.textContent = '⇪ Start Sharing';
      showToast('error', 'Share failed', e.message, 5000);
    });
}

function shareStop() {
  fetch('/share/stop', { method: 'POST' })
    .then(() => {
      shareStopPolling();
      shareSetRunningUI(false);
      showToast('info', 'Sharing stopped', 'The tunnel has been closed.', 3000);
    })
    .catch(() => {
      shareStopPolling();
      shareSetRunningUI(false);
    });
}

function shareSetRunningUI(running) {
  const startBtn = document.getElementById('shareStartBtn');
  const stopBtn  = document.getElementById('shareStopBtn');
  const badge    = document.getElementById('shareStatusBadge');
  const creds    = document.getElementById('shareCredsSection');
  const urlRow   = document.getElementById('shareUrlRow');
  const waiting  = document.getElementById('shareWaiting');
  const logWrap  = document.getElementById('shareLogDetails');

  if (running) {
    startBtn.style.display    = 'none';
    stopBtn.style.display     = '';
    creds.style.pointerEvents = 'none';
    creds.style.opacity       = '0.5';
    badge.textContent         = '● Live';
    badge.className           = 'share-status-badge share-badge-live';
    waiting.style.display     = 'flex';
    urlRow.style.display      = 'none';
    logWrap.style.display     = '';
  } else {
    startBtn.disabled         = false;
    startBtn.textContent      = '⇪ Start Sharing';
    startBtn.style.display    = '';
    stopBtn.style.display     = 'none';
    creds.style.pointerEvents = '';
    creds.style.opacity       = '';
    badge.textContent         = '';
    badge.className           = 'share-status-badge';
    waiting.style.display     = 'none';
    urlRow.style.display      = 'none';
    logWrap.style.display     = 'none';
    document.getElementById('shareUrlText').textContent = '—';
  }
}

function shareStartPolling() {
  shareStopPolling();
  sharePollingInterval.id = setInterval(sharePollStatus, 2000);
  sharePollStatus();
}

function shareStopPolling() {
  if (sharePollingInterval.id) {
    clearInterval(sharePollingInterval.id);
    sharePollingInterval.id = null;
  }
}

function sharePollStatus() {
  fetch('/share/status')
    .then(r => r.json())
    .then(data => {
      const logBox = document.getElementById('shareLogBox');
      if (logBox && data.log) {
        logBox.textContent = data.log.join('\n');
        logBox.scrollTop   = logBox.scrollHeight;
      }
      if (!data.running) {
        shareStopPolling();
        shareSetRunningUI(false);
        return;
      }
      if (data.tunnelUrl) {
        document.getElementById('shareWaiting').style.display = 'none';
        document.getElementById('shareUrlRow').style.display  = '';
        document.getElementById('shareUrlText').textContent   = data.tunnelUrl;
      }
    })
    .catch(() => shareStopPolling());
}

function copyShareUrl() {
  const url = document.getElementById('shareUrlText').textContent;
  if (!url || url === '—') return;
  navigator.clipboard.writeText(url).then(() => {
    showToast('success', 'Copied', 'URL copied to clipboard.', 2000);
  });
}

function toggleSharePasswordVisibility() {
  const input = document.getElementById('sharePassword');
  input.type  = input.type === 'password' ? 'text' : 'password';
}