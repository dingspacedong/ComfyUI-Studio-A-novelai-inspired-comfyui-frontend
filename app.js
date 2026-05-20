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
  injectLatentNoise: false,

  // Marbles
  marblesEnabled: false,
  marbles: 0,

  // Image actions state
  enhancePanelOpen: false,
  upscalePanelOpen: false,
  imageMode: null, // null | 'upscale' | 'enhance'

  // Token count
  tokenCountVisible: true,

  // Batch tracking
  batchTotal: 1,
  batchCurrent: 0,
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

  setupResizeHandle();
  setupCardResizeHandles();
  setupCollapsibleCards();
  setupCSVDrop();
  setupBaseImgZone();
  updateResFromTable();

  const savedSession = loadSessionStart();
  loadModels().then(() => {
    if (savedSession) loadSessionModels(savedSession);
  });
  loadUpscaleModels();

  connectWS();
  updateTokenCount();

  document.getElementById('qualityTagsEnabled').addEventListener('change', e => {
    state.qualityTagsEnabled = e.target.checked;
  });
  document.getElementById('qualityTagsText').addEventListener('input', e => {
    state.qualityTagsText = e.target.value;
    updateTokenCount();
  });
  document.getElementById('negQualityTagsEnabled').addEventListener('change', e => {
    state.negQualityTagsEnabled = e.target.checked;
  });
  document.getElementById('negQualityTagsText').addEventListener('input', e => {
    state.negQualityTagsText = e.target.value;
    updateTokenCount();
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

  // Auto-scan for CSV files
  scanAutoCompleteFolder();

  // Sync theme color pickers to current theme
  syncThemeColorPickers();
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
}

// ─────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────
function setProgress(value, max) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${value}/${max}`;
}
function clearProgress() {
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressText').textContent = '';
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
    state.availableLoras = loras;
    document.querySelectorAll('.lora-sel').forEach(sel => {
      const cur = sel.value;
      populateSel(sel, loras);
      sel.value = cur;
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

// ─────────────────────────────────────────────
// PROMPT TABS
// ─────────────────────────────────────────────
function switchPromptTab(tab, btn) {
  document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.prompt-pane').forEach(p => p.classList.remove('active-pane'));
  document.getElementById('prompt' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active-pane');
  updateTokenCount();
}

// ─────────────────────────────────────────────
// TOKEN COUNT — cumulative from ALL prompts + character prompts
// ─────────────────────────────────────────────
function updateTokenCount() {
  function countTokens(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/[,\s]+/).filter(Boolean).length;
  }

  const posText = document.getElementById('positivePrompt')?.value || '';
  const negText = document.getElementById('negativePrompt')?.value || '';
  const qualText = (state.qualityTagsEnabled && state.qualityTagsText) ? state.qualityTagsText : '';
  const negQualText = (state.negQualityTagsEnabled && state.negQualityTagsText) ? state.negQualityTagsText : '';

  // Add character prompt tokens
  let charTokens = 0;
  state.characters.forEach(ch => {
    if (!ch.enabled) return;
    const item = document.querySelector(`.char-item[data-charid="${ch.id}"]`);
    if (item) {
      charTokens += countTokens(item.querySelector('.char-ta')?.value || '');
    }
  });

  const total = countTokens(posText) + countTokens(negText) +
                countTokens(qualText) + countTokens(negQualText) + charTokens;

  document.getElementById('tokenCount').textContent = total;

  // Total token budget = 75 per chunk; show chunks
  const chunks = Math.max(1, Math.ceil(total / 75));
  document.getElementById('tokenTotal').textContent = chunks * 75;

  const warn = document.getElementById('tokenWarn');
  if (total > 75) {
    warn.textContent = `(${chunks} chunks)`;
  } else {
    warn.textContent = '';
  }
}

// ─────────────────────────────────────────────
// PROMPT INTENSITY HIGHLIGHTING
// ─────────────────────────────────────────────
function updatePromptHighlight(side) {
  const ta = document.getElementById(side === 'positive' ? 'positivePrompt' : 'negativePrompt');
  const layer = document.getElementById(side === 'positive' ? 'highlightLayerPositive' : 'highlightLayerNegative');
  if (!ta || !layer) return;
 
  const text = ta.value;
  // Replace (tag:weight) patterns with highlighted spans; escape everything else
  const escaped = escapeHTMLPreserveStructure(text);
  layer.innerHTML = escaped;
  syncHighlightScroll(side);
}
 
function escapeHTMLPreserveStructure(text) {
  // We build the highlighted HTML carefully
  let result = '';
  let i = 0;
  while (i < text.length) {
    // Look for ( ... : number )
    if (text[i] === '(') {
      // find matching close paren
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')') depth--;
        j++;
      }
      if (depth === 0) {
        const inner = text.slice(i + 1, j - 1);
        // Check if ends with :number
        const m = inner.match(/^([\s\S]*):(\s*[\d.]+\s*)$/);
        if (m) {
          const weight = parseFloat(m[2]);
          let cls = '';
          if (weight > 1) cls = 'mod-high';
          else if (weight === 1) cls = 'mod-mid';
          else cls = 'mod-low';
          result += `<span class="${cls}">${escapeHTML('(' + inner + ')')}</span>`;
          i = j;
          continue;
        }
      }
    }
    // Newline
    if (text[i] === '\n') { result += '\n'; i++; continue; }
    // Normal char - escape HTML
    const ch = text[i];
    if (ch === '&') result += '&amp;';
    else if (ch === '<') result += '&lt;';
    else if (ch === '>') result += '&gt;';
    else result += ch;
    i++;
  }
  // The layer needs a trailing space/newline to match textarea height
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

// ─────────────────────────────────────────────
// COLLAPSIBLE CARDS
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
    updateTokenCount();
  });

  document.getElementById('characterList').appendChild(clone);
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
  const sel = clone.querySelector('.lora-sel');

  if (state.availableLoras.length > 0) {
    populateSel(sel, state.availableLoras);
  } else {
    const o = document.createElement('option');
    o.textContent = 'No LoRAs found';
    sel.appendChild(o);
  }
  list.appendChild(clone);
}

function removeLora(btn) {
  btn.closest('.lora-item').remove();
  if (document.querySelectorAll('.lora-item').length === 0) {
    document.getElementById('loraList').innerHTML = '<p class="empty-hint">No LoRAs — click ＋ to add</p>';
  }
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
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
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
    state.pendingMetadata = meta;
    state.img2imgFile = file;
    state.img2imgDataUrl = dataUrl;
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
  updateTokenCount();
  updatePromptHighlight('positive');
  updatePromptHighlight('negative');
}

function useImg2Img() {
  if (state.img2imgFile) setImg2Img(state.img2imgFile, state.img2imgDataUrl);
  closeMetaModal();
}

function setImg2Img(file, dataUrl) {
  state.img2imgFile    = file;
  state.img2imgDataUrl = dataUrl;
  document.getElementById('img2imgPreview').src = dataUrl;
  document.getElementById('img2imgStrip').style.display = 'block';
}

function removeImg2Img() {
  state.img2imgFile = null;
  state.img2imgDataUrl = null;
  document.getElementById('img2imgStrip').style.display = 'none';
  document.getElementById('img2imgPreview').src = '';
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
function showHistoryHelp(show) {
  const popup = document.getElementById('historyHelpPopup');
  popup.classList.toggle('open', show);
}

function addToHistory(imageUrl, metaObj) {
  state.historyCounter++;
  const id = state.historyCounter;

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

  const empty = document.querySelector('.history-empty');
  if (empty) empty.remove();

  const list = document.getElementById('historyList');
  list.insertBefore(clone, list.firstChild);

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
    document.getElementById('historyList').innerHTML = '<p class="empty-hint history-empty">Generated images will appear here</p>';
  }
}

function clearHistory() {
  showConfirm('Clear all history? This cannot be undone.', () => {
    state.history = [];
    document.getElementById('historyList').innerHTML = '<p class="empty-hint history-empty">Generated images will appear here</p>';
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
const DEFAULT_THEME = {
  '--bg-void': '#0d1a0d',
  '--bg-panel': '#101e10',
  '--bg-card': '#122012',
  '--bg-input': '#0b160b',
  '--bg-elevated': '#182818',
  '--bg-overlay': 'rgba(8,18,8,0.90)',
  '--border-faint': 'rgba(60,180,60,0.10)',
  '--border-mid': 'rgba(80,200,80,0.18)',
  '--border-accent': 'rgba(80,255,80,0.30)',
  '--accent': '#39ff14',
  '--accent-glow': 'rgba(57,255,20,0.14)',
  '--accent-bright': '#80ff60',
  '--accent-dim': 'rgba(57,255,20,0.40)',
  '--positive': '#39ff14',
  '--negative': '#ff4444',
  '--text-hi': '#c8ffc0',
  '--text-mid': '#60a860',
  '--text-lo': '#2e602e',
  '--modifier-low': 'rgba(57,255,20,0.20)',
  '--modifier-high': 'rgba(255,68,68,0.25)',
  '--gen-btn-from': '#1a8010',
  '--gen-btn-to': '#39ff14'
};

function resetCustomTheme() {
  Object.entries(DEFAULT_THEME).forEach(([varName, val]) => {
    document.documentElement.style.setProperty(varName, val);
    // If you have inputs bound to these, update them too:
    const input = document.querySelector(`[data-var="${varName}"]`);
    if (input) input.value = val;
  });
  localStorage.removeItem('customThemeConfig');
  console.log('Custom theme reset to defaults.');
}
// ─────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────
function applyTheme(themeName, btn, silent) {
  document.documentElement.setAttribute('data-theme', themeName);
  state.currentTheme = themeName;
  localStorage.setItem('comfyStudioTheme', themeName);
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
  document.documentElement.style.setProperty(varName, value);
}

function applyCustomFontVar(varName, fontName, fallback) {
  if (!fontName.trim()) {
    document.documentElement.style.removeProperty(varName);
  } else {
    document.documentElement.style.setProperty(varName, `'${fontName}', ${fallback}`);
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

async function loadAutocompleteSource() {
  const val = document.getElementById('autocompleteSource').value;
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
  document.querySelectorAll('.autocomplete-list').forEach(el => el.remove());
}

function setupPromptAutocomplete() {
  removeAutocompleteHandlers();
  const textareas = [
    document.getElementById('positivePrompt'),
    document.getElementById('negativePrompt'),
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
      const start = textarea.selectionStart - cur.length;
      const end   = textarea.selectionStart;
      textarea.value = textarea.value.slice(0, start) + tag + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      updateTokenCount();
    }

    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', onKeydown);
    ta.addEventListener('blur', onBlur);
    _acHandlers.push([ta,'input',onInput],[ta,'keydown',onKeydown],[ta,'blur',onBlur]);
  });
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
    alert(`Generation failed:\n${e.message}\n\nMake sure ComfyUI is running at ${state.comfyUrl} with --enable-cors-header`);
    resetBtn();
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
  resetBtn();
  alert('Generation timed out.');
}

async function displayImage(filename, subfolder, type) {
  const params = new URLSearchParams({ filename, subfolder, type });
  const url = `${state.comfyUrl}/view?${params}`;

  let finalUrl = url;
  if (state.lastGenMeta) {
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

function saveImage() {
  if (!state.currentImageUrl) return;
  const a = document.createElement('a');
  a.href = state.currentImageUrl;
  a.download = state.currentImageFilename || 'ComfyStudio.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
    alert('Upscale failed: ' + e.message);
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

    // Load checkpoint for enhance pass
    const ckptId = id();
    nodes[ckptId] = {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: document.getElementById('checkpointSelect').value }
    };
    const modelSrc = [ckptId, 0], clipSrc = [ckptId, 1], vaeSrc = [ckptId, 2];

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
    nodes[posId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: buildPositivePrompt() } };
    const negId = id();
    nodes[negId] = { class_type: 'CLIPTextEncode', inputs: { clip: clipSrc, text: buildNegativePrompt() } };

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
    alert('Enhance failed: ' + e.message);
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
  const data = {
    comfyUrl: document.getElementById('comfyUrl')?.value,
    positivePrompt: document.getElementById('positivePrompt')?.value,
    negativePrompt: document.getElementById('negativePrompt')?.value,
    modelType: state.modelType,
    checkpointSelect: document.getElementById('checkpointSelect')?.value,
    diffusionSelect: document.getElementById('diffusionSelect')?.value,
    vaeSelect: document.getElementById('vaeSelect')?.value,
    teSelect: document.getElementById('teSelect')?.value,
    teType: document.getElementById('teType')?.value,
    samplerName: document.getElementById('samplerName')?.value,
    scheduler: document.getElementById('scheduler')?.value,
    stepsNum: document.getElementById('stepsNum')?.value,
    cfgNum: document.getElementById('cfgNum')?.value,
    denoiseNum: document.getElementById('denoiseNum')?.value,
    batchNum: document.getElementById('batchNum')?.value,
    resW: state.resW, resH: state.resH,
    resCategory: state.resCategory,
    resOrient: state.resOrient,
    resStandard: state.resStandard,
    customMode: state.customMode,
    customW: document.getElementById('customW')?.value,
    customH: document.getElementById('customH')?.value,
    seedInput: document.getElementById('seedInput')?.value,
    seedLocked: state.seedLocked,
    characters: state.characters,
    charCounter: state.charCounter,
    loras: getActiveLoRAs(),
    qualityTagsEnabled: state.qualityTagsEnabled,
    qualityTagsText: document.getElementById('qualityTagsText')?.value,
    negQualityTagsEnabled: state.negQualityTagsEnabled,
    negQualityTagsText: document.getElementById('negQualityTagsText')?.value,
    vPrediction: state.vPrediction,
    rescaleCFGEnabled: state.rescaleCFGEnabled,
  };
  localStorage.setItem('comfyStudioSession', JSON.stringify(data));
  localStorage.setItem('comfyStudioNotif', state.notifSoundEnabled);
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

    updateTokenCount();
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
    if (el && val !== undefined) el.value = val;
  };
  setVal('checkpointSelect', data.checkpointSelect);
  setVal('diffusionSelect', data.diffusionSelect);
  setVal('vaeSelect', data.vaeSelect);
  setVal('teSelect', data.teSelect);
  setVal('teType', data.teType);
  if (data.loras && data.loras.length > 0) {
    document.getElementById('loraList').innerHTML = '';
    data.loras.forEach(l => {
      addLora();
      const items = document.querySelectorAll('.lora-item');
      const lastItem = items[items.length - 1];
      if (lastItem) {
        lastItem.querySelector('.lora-sel').value = l.name;
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
