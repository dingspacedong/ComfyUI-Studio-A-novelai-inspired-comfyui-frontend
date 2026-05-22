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
    'save-vPrediction': true,
    'save-rescaleCFG': true,
    'save-varSettings': true,
    'save-enhanceSettings': true,
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
};

// ─────────────────────────────────────────────
// RESOLUTION TABLE
// ─────────────────────────────────────────────
const resTable = {
  normal: {
    portrait:  { sdxl:[832,1216],  novelai:[832,1216],  anima:[832,1216]  },
    landscape: { sdxl:[1216,832],  novelai:[1216,832],  anima:[1216,832]  },
    square:    { sdxl:[1024,1024], novelai:[1024,1024], anima:[1024,1024] },
  },
  large: {
    portrait:  { sdxl:[896,1536],  novelai:[1024,1536],  anima:[1024,1536]  },
    landscape: { sdxl:[1536,896],  novelai:[1536,1024],  anima:[1536,1024]  },
    square:    { sdxl:[1344,1344], novelai:[1472,1472], anima:[1152,1152] },
  },
  wallpaper: {
    portrait:  { sdxl:[768,1344],  novelai:[768,1344],  anima:[768,1344]  },
    landscape: { sdxl:[1344,768],  novelai:[1344,768],  anima:[1344,768]  },
    square:    { sdxl:[1024,1024], novelai:[1536,1536], anima:[1536,1536] },
  },
  small: {
    portrait:  { sdxl:[512,768],   novelai:[512,768],   anima:[512,768]   },
    landscape: { sdxl:[768,512],   novelai:[768,512],   anima:[768,512]   },
    square:    { sdxl:[512,512],   novelai:[640,640],   anima:[640,640]   },
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
  const wsUrl = state.comfyUrl.replace(/^http/, 'ws') + '/ws?clientId=' + state.clientId;
  try { state.ws = new WebSocket(wsUrl); }
  catch(e) { dot.className = 'status-dot error'; txt.textContent = 'Cannot connect'; return; }
  state.ws.addEventListener('open', () => {
    dot.className = 'status-dot connected'; txt.textContent = 'Connected';
  });
  state.ws.addEventListener('close', () => {
    dot.className = 'status-dot error'; txt.textContent = 'Disconnected';
    setTimeout(connectWS, 6000);
  });
  state.ws.addEventListener('error', () => {
    dot.className = 'status-dot error'; txt.textContent = 'Error';
  });
  state.ws.addEventListener('message', onWSMessage);
}

function reconnect() {
  state.comfyUrl = document.getElementById('comfyUrl').value.replace(/\/$/, '');
  connectWS();
  loadModels();
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
    if (data.data.node === null && data.data.prompt_id === state.lastPromptId) {
      fetchLatestImage();
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
    const [checkpoints, diffusions, vaes, loras, textEncoders] = await Promise.all([
      fetchList('CheckpointLoaderSimple', 'ckpt_name'),
      fetchList('UNETLoader', 'unet_name'),
      fetchList('VAELoader', 'vae_name'),
      fetchList('LoraLoader', 'lora_name'),
      fetchList('CLIPLoader', 'clip_name'),
    ]);
    populateSel('checkpointSelect', checkpoints);
    populateSel('diffusionSelect', diffusions);
    populateSel('vaeSelect', ['Automatic (embedded)', ...vaes]);
    populateSel('teSelect', ['none', ...textEncoders]);
    // Also populate enhance model selects
    populateSel('enhanceCheckpointSelect', checkpoints);
    populateSel('enhanceDiffusionSelect', diffusions);
    populateSel('enhanceVaeSelect', ['Automatic (embedded)', ...vaes]);
    populateSel('enhanceTeSelect', ['none', ...textEncoders]);
    state.availableLoras = loras;
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
  const res = await fetch(`${state.comfyUrl}/object_info/${node}`);
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
  if (document.getElementById('metaChkSampler').checked) {
    if (meta.sampler)   document.getElementById('samplerName').value = meta.sampler;
    if (meta.scheduler) document.getElementById('scheduler').value   = meta.scheduler;
    if (meta.steps)     { document.getElementById('stepsNum').value = meta.steps; syncNum('steps'); }
    if (meta.cfg)       { document.getElementById('cfgNum').value   = meta.cfg;   syncNum('cfg'); }
    if (meta.denoise)   { document.getElementById('denoiseNum').value = meta.denoise; syncNum('denoise'); }
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
  const SPLICE_AT = 33;
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
  set('tc-accent', get('--accent'));
  set('tc-accent-bright', get('--accent-bright'));
  set('tc-positive', get('--positive'));
  set('tc-negative', get('--negative'));
  set('tc-text-hi', get('--text-hi'));
  set('tc-text-mid', get('--text-mid'));
  set('tc-gen-btn', get('--gen-btn-from'));
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
  // Try to fetch a directory listing from the comfystudio autocomplete folder
  // This works if served from a local server that allows directory listing,
  // or from an express-style server. Falls back gracefully.
  const folderPath = 'comfystudio autocomplete/';
  const select = document.getElementById('autocompleteSource');
  const status = document.getElementById('autocompleteStatus');

  try {
    const resp = await fetch(folderPath);
    if (!resp.ok) throw new Error('Not found');
    const text = await resp.text();

    // Parse href links from directory listing HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const links = [...doc.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h.toLowerCase().endsWith('.csv') && !h.startsWith('http') && !h.startsWith('/'));

    if (links.length > 0) {
      // Clear existing options (keep "None")
      while (select.options.length > 1) select.remove(1);
      links.forEach(filename => {
        const opt = document.createElement('option');
        // Strip any path prefix, keep just filename
        const name = filename.split('/').pop();
        opt.value = folderPath + name;
        opt.textContent = name;
        select.appendChild(opt);
      });
      status.textContent = `✓ Found ${links.length} CSV file(s) in autocomplete folder.`;
    } else {
      status.textContent = 'No CSV files found in autocomplete folder (or folder listing unavailable).';
    }
  } catch(e) {
    // Silently fail — user can still drop CSV files manually
    status.textContent = 'Auto-detect unavailable (use drag-and-drop below).';
  }

  // After populating the select, restore the last-used source from the previous session
  if (state._pendingAcSource) {
    const pending = state._pendingAcSource;
    delete state._pendingAcSource;
    // Check if the option exists in the select (it will if the folder scan found it)
    const match = [...select.options].find(o => o.value === pending);
    if (match) {
      select.value = pending;
      await loadAutocompleteSource(true); // skipSave=true to avoid re-saving during restore
    } else {
      // Option not in select yet (e.g. dropped CSV) — try to load directly by path/url
      // This handles the case where the source was a server-relative path
      try {
        const resp = await fetch(pending);
        if (resp.ok) {
          const text = await resp.text();
          const name = pending.split('/').pop();
          parseCSVText(text, name);
          // Add a synthetic option so the select shows the right value
          const opt = document.createElement('option');
          opt.value = pending; opt.textContent = name;
          select.appendChild(opt);
          select.value = pending;
        }
      } catch(e) { /* silently ignore — CSV may have been moved */ }
    }
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
function buildWorkflow(img2imgNodeId) {
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

  const ksId = id();
  nodes[ksId] = {
    class_type: 'KSampler',
    inputs: {
      model: modelSrc, positive: [posId, 0], negative: [negId, 0],
      latent_image: latentSrc,
      seed, steps, cfg, sampler_name: samplerName, scheduler, denoise,
    }
  };

  const decId = id();
  nodes[decId] = { class_type: 'VAEDecode', inputs: { samples: [ksId, 0], vae: vaeSrc || ['1', 2] } };

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

  const workflow = buildWorkflow(img2imgNodeId);
  state.lastGenMeta = captureGenMeta(document.getElementById('seedInput').value);

  try {
    const res = await fetch(`${state.comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: state.clientId })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    state.lastPromptId = data.prompt_id;
    pollForImages(data.prompt_id, batchSize);
  } catch(e) {
    console.error(e);
    showGenOverlay(false);
    clearProgress();
    removePendingHistoryItems();
    resetBtn();
    showToast('error', 'Generation Failed', e.message || String(e));
  }
}

async function uploadImg2ImgFile() {
  const formData = new FormData();
  formData.append('image', state.img2imgFile, state.img2imgFile.name || 'img2img.png');
  const res = await fetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: formData });
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
    loras: getActiveLoRAs(),
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
      const res = await fetch(`${state.comfyUrl}/history/${promptId}`);
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
  showToast('error', 'Generation Timed Out', 'No response from ComfyUI after 10 minutes.');
}

async function displayImage(filename, subfolder, type) {
  const params = new URLSearchParams({ filename, subfolder, type });
  const url = `${state.comfyUrl}/view?${params}`;

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
    const res = await fetch(`${state.comfyUrl}/history/${state.lastPromptId}`);
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
  try { await fetch(`${state.comfyUrl}/interrupt`, { method: 'POST' }); } catch(e) {}
  resetBtn();
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

// Per-session sync flag: set to true after we've queried share.py for existing file counts
const _counterSynced = {};

// Query share.py /list once per session per folder to seed the counter from actual disk contents.
// This prevents re-using numbers if localStorage was cleared or files were added externally.
async function syncCounterFromFolder(folderKey) {
  if (_counterSynced[folderKey]) return;
  _counterSynced[folderKey] = true;
  const folderPath = folderKey === 'inpaint' && state.inpaintOutputPath
    ? state.inpaintOutputPath
    : state.outputPath;
  if (!folderPath) return;
  try {
    const res = await fetch('http://127.0.0.1:3001/list', {
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
  } catch(e) { /* share.py not running — counter still works from localStorage */ }
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
  // We can't write to the filesystem directly from a browser — we call share.py.
  // share.py must be running (python share.py) for folder saves to work.
  //
  // share.py expects a base64 data URL. If imageUrl is a blob: URL (which is common
  // when metadata has been embedded), we must first fetch the blob and convert it
  // to a base64 data URL before sending — otherwise share.py receives the literal
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
    const res = await fetch('http://127.0.0.1:3001/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, filename, dataUrl }),
    });
    if (res.ok) {
      showToast('success', 'Image Saved', `Saved to ${folderPath}\\${filename}`, 3000);
      return true;
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('error', 'Save Failed', err.error || 'share.py returned an error.', 0);
    }
  } catch(e) {
    // share.py not running
    showToast('error', 'share.py Not Running',
      'To save to a folder, run <code>python share.py</code> in the same directory as this app. Falling back to browser download.', 0);
  }
  return false;
}

async function saveImage(isInpaint = false) {
  if (!state.currentImageUrl) return;
  const folderPath = getOutputPath(isInpaint);
  const folderKey  = isInpaint && state.inpaintOutputPath ? 'inpaint' : 'default';
  const filename   = await getNextOutputFilenameAsync(folderKey);

  if (folderPath) {
    // Try to save to path via share.py; if that fails, fall back to browser download
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
  saveImageToPath(state.currentImageUrl, folderPath, filename);
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
    const up = await fetch(`${state.comfyUrl}/upload/image`, {method:'POST',body:fd});
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

    const res = await fetch(`${state.comfyUrl}/prompt`, {
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
    const up = await fetch(`${state.comfyUrl}/upload/image`, {method:'POST',body:fd});
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
      // For diffusion model, fall back to main VAE
      const vaeRaw = document.getElementById('vaeSelect').value;
      if (vaeRaw && vaeRaw !== 'Automatic (embedded)') {
        const vaeId = id();
        nodes[vaeId] = { class_type: 'VAELoader', inputs: { vae_name: vaeRaw } };
        vaeSrc = [vaeId, 0];
      }
      // Use main CLIP
      const teVal = document.getElementById('teSelect')?.value;
      if (teVal && teVal !== 'none') {
        const teId = id();
        nodes[teId] = { class_type: 'CLIPLoader', inputs: { clip_name: teVal, type: document.getElementById('teType')?.value || 'stable_diffusion' } };
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

    const res = await fetch(`${state.comfyUrl}/prompt`, {
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
  isEraser: false,
  isEyedrop: false,
  painting: false,
  color: '#ff6b9d',
  brushSize: 12,
  ctx: null,
  lastX: 0, lastY: 0,
};

function openDrawMenu() {
  if (!state.img2imgDataUrl) return;
  const modal = document.getElementById('drawModal');
  const backdrop = document.getElementById('drawModalBackdrop');
  const baseImg = document.getElementById('drawBaseImg');
  const canvas = document.getElementById('drawCanvas');

  baseImg.src = state.img2imgDataUrl;
  modal.classList.add('open');
  backdrop.classList.add('open');

  // Wait for image to load to size canvas
  baseImg.onload = () => {
    resizeDrawCanvas();
  };
  if (baseImg.complete) resizeDrawCanvas();

  drawState.ctx = canvas.getContext('2d');
  drawState.isEraser = false;
  drawState.isEyedrop = false;
  document.getElementById('drawEraserBtn').classList.remove('active');
  document.getElementById('drawEyedropBtn').classList.remove('active');
  applyBrushCursor(canvas, drawState.brushSize, false);

  setupDrawEvents(canvas);
}

function resizeDrawCanvas() {
  const wrap = document.getElementById('drawCanvasWrap');
  const canvas = document.getElementById('drawCanvas');
  const img = document.getElementById('drawBaseImg');
  const wrapW = wrap.clientWidth;
  const wrapH = wrap.clientHeight;
  const imgW = img.naturalWidth || wrapW;
  const imgH = img.naturalHeight || wrapH;
  const scale = Math.min(wrapW / imgW, wrapH / imgH, 1);
  const displayW = Math.round(imgW * scale);
  const displayH = Math.round(imgH * scale);
  const offsetX = Math.round((wrapW - displayW) / 2);
  const offsetY = Math.round((wrapH - displayH) / 2);

  // Save old canvas data
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = canvas.width; tmpCanvas.height = canvas.height;
  if (canvas.width > 0 && canvas.height > 0) {
    tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);
  }
  canvas.width = displayW;
  canvas.height = displayH;
  canvas.style.width  = displayW + 'px';
  canvas.style.height = displayH + 'px';
  canvas.style.left   = offsetX + 'px';
  canvas.style.top    = offsetY + 'px';

  // Match base image to canvas exactly
  img.style.position = 'absolute';
  img.style.inset    = 'unset';
  img.style.width    = displayW + 'px';
  img.style.height   = displayH + 'px';
  img.style.left     = offsetX + 'px';
  img.style.top      = offsetY + 'px';
  img.style.objectFit = 'fill';

  // Restore old drawing scaled
  if (tmpCanvas.width > 0 && tmpCanvas.height > 0) {
    drawState.ctx = canvas.getContext('2d');
    drawState.ctx.drawImage(tmpCanvas, 0, 0, displayW, displayH);
  }
}

function setupDrawEvents(canvas) {
  // Remove old listeners by cloning
  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);
  drawState.ctx = newCanvas.getContext('2d');

  const getPos = (e) => {
    const rect = newCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startPaint = (e) => {
    e.preventDefault();
    if (drawState.isEyedrop) {
      // Pick color from base image
      pickColorFromImg(e, newCanvas, document.getElementById('drawBaseImg'), (hex) => {
        drawState.color = hex;
        document.getElementById('drawColor').value = hex;
      });
      return;
    }
    drawState.painting = true;
    const pos = getPos(e);
    drawState.lastX = pos.x; drawState.lastY = pos.y;
    drawDot(newCanvas, pos.x, pos.y);
  };
  const movePaint = (e) => {
    e.preventDefault();
    if (!drawState.painting) return;
    const pos = getPos(e);
    drawLine(newCanvas, drawState.lastX, drawState.lastY, pos.x, pos.y);
    drawState.lastX = pos.x; drawState.lastY = pos.y;
  };
  const endPaint = () => { drawState.painting = false; };

  newCanvas.addEventListener('mousedown', startPaint);
  newCanvas.addEventListener('mousemove', movePaint);
  newCanvas.addEventListener('mouseup', endPaint);
  newCanvas.addEventListener('mouseleave', endPaint);
  newCanvas.addEventListener('touchstart', startPaint, {passive:false});
  newCanvas.addEventListener('touchmove', movePaint, {passive:false});
  newCanvas.addEventListener('touchend', endPaint);
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
  applyBrushCursor(document.getElementById('drawCanvas'), drawState.brushSize, drawState.isEraser);
}

function updateDrawColor(val) {
  drawState.color = val;
  drawState.isEraser = false;
  document.getElementById('drawEraserBtn').classList.remove('active');
  applyBrushCursor(document.getElementById('drawCanvas'), drawState.brushSize, false);
}

function toggleDrawEraser() {
  drawState.isEraser = !drawState.isEraser;
  drawState.isEyedrop = false;
  document.getElementById('drawEraserBtn').classList.toggle('active', drawState.isEraser);
  document.getElementById('drawEyedropBtn').classList.remove('active');
  applyBrushCursor(document.getElementById('drawCanvas'), drawState.brushSize, drawState.isEraser);
}

function toggleDrawEyedrop() {
  drawState.isEyedrop = !drawState.isEyedrop;
  drawState.isEraser = false;
  document.getElementById('drawEyedropBtn').classList.toggle('active', drawState.isEyedrop);
  document.getElementById('drawEraserBtn').classList.remove('active');
  // Eyedrop gets a crosshair
  const canvas = document.getElementById('drawCanvas');
  if (canvas) canvas.style.cursor = drawState.isEyedrop ? 'crosshair' : null;
  if (!drawState.isEyedrop) applyBrushCursor(canvas, drawState.brushSize, false);
}

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
  const canvas = document.getElementById('drawCanvas');
  const baseImg = document.getElementById('drawBaseImg');

  // Merge: draw base image then overlay canvas onto a composite
  const composite = document.createElement('canvas');
  composite.width = baseImg.naturalWidth;
  composite.height = baseImg.naturalHeight;
  const cCtx = composite.getContext('2d');
  cCtx.drawImage(baseImg, 0, 0);
  // Scale drawing to natural resolution
  cCtx.drawImage(canvas, 0, 0, composite.width, composite.height);

  composite.toBlob(blob => {
    const file = new File([blob], 'drawn.png', {type:'image/png'});
    const dataUrl = URL.createObjectURL(blob);
    setImg2Img(file, dataUrl);
    closeDrawModal();
  }, 'image/png');
}

function closeDrawModal() {
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
    const imgUp   = await fetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: imgFd });
    if (!imgUp.ok) throw new Error('Image upload failed');
    const { name: imgName } = await imgUp.json();

    const maskFile = new File([scaledMaskBlob], 'fi_mask.png', { type: 'image/png' });
    const maskFd   = new FormData(); maskFd.append('image', maskFile, maskFile.name);
    const maskUp   = await fetch(`${state.comfyUrl}/upload/image`, { method: 'POST', body: maskFd });
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

    const res = await fetch(`${state.comfyUrl}/prompt`, {
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
    const imgUp = await fetch(`${state.comfyUrl}/upload/image`, {method:'POST', body:imgFd});
    if (!imgUp.ok) throw new Error('Image upload failed');
    const {name: imgName} = await imgUp.json();

    const maskFile = new File([state.inpaintMaskBlob], 'inpaint_mask.png', {type:'image/png'});
    const maskFd = new FormData(); maskFd.append('image', maskFile, maskFile.name);
    const maskUp = await fetch(`${state.comfyUrl}/upload/image`, {method:'POST', body:maskFd});
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
    const res = await fetch(`${state.comfyUrl}/prompt`, {
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
});

// Show/hide inpaint button when img2img state changes
function updateInpaintBtnVisibility() {
  const btn = document.getElementById('inpaintLaunchBtn');
  if (btn) btn.style.display = (state.inpaintEnabled && state.img2imgDataUrl) ? 'block' : 'none';
}