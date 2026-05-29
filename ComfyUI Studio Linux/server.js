#!/usr/bin/env node
/* ================================================
   ComfyUI Studio — server.js
   ================================================
   • Serves the studio on http://localhost:PORT
   • Proxies /comfy/* → ComfyUI (fixes CORS)
   • /share/* endpoints manage a cloudflared tunnel
   • Shared visitors must pass HTTP Basic Auth

   Usage:
     node server.js
     node server.js --port 3000 --comfy http://127.0.0.1:8188

   No npm install needed — pure Node stdlib.
================================================ */

const http        = require('http');
const https       = require('https');
const net         = require('net');
const fs          = require('fs');
const path        = require('path');
const { URL }     = require('url');
const { spawn }   = require('child_process');

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return (i !== -1 && args[i + 1]) ? args[i + 1] : def;
}
const PORT       = parseInt(arg('port',  '3000'), 10);
const COMFY_URL  = arg('comfy', 'http://127.0.0.1:8188').replace(/\/$/, '');
const STATIC_DIR = path.resolve(__dirname);
const OUTPUT_DIR = path.resolve(arg('output', './outputs'));
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── MIME ────────────────────────────────────────────────────────────
const MIME = {
  '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
};

// ── Generation metadata store ───────────────────────────────────────
// The host pushes { prompt_id, meta } here after each generation.
// Remote clients pull it by prompt_id so they can embed the same metadata
// into the PNG before downloading, matching what the local user gets.
const metaStore = new Map(); // prompt_id → meta object
const META_STORE_MAX = 50;   // keep last 50 entries; discard oldest

// ── Share / tunnel state ────────────────────────────────────────────
const shareState = {
  running:    false,
  tunnelUrl:  null,
  username:   '',
  password:   '',
  proc:       null,
  log:        [],
};

function shareLog(line) {
  shareState.log.push(line);
  if (shareState.log.length > 80) shareState.log.shift();
}

// ── Start tunnel ────────────────────────────────────────────────────
function startTunnel(localUrl) {
  if (shareState.proc) return;

  const proc = spawn('cloudflared', ['tunnel', '--url', localUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  shareState.proc    = proc;
  shareState.running = true;
  shareState.tunnelUrl = null;
  shareLog('[cloudflared] starting…');

  const onData = (data) => {
    data.toString().split('\n').forEach(line => {
      if (!line.trim()) return;
      shareLog(line);
      const m = line.match(/https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/i);
      if (m && !shareState.tunnelUrl) {
        shareState.tunnelUrl = m[0];
        shareLog('[studio] Tunnel ready: ' + shareState.tunnelUrl);
      }
    });
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('error', (e) => {
    shareLog('[error] ' + e.message);
    if (e.code === 'ENOENT') {
      shareLog('[error] cloudflared not found on PATH.');
      shareLog('[error] Download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    }
    stopTunnel();
  });

  proc.on('exit', (code) => {
    shareLog('[cloudflared] exited (code ' + code + ')');
    shareState.running   = false;
    shareState.tunnelUrl = null;
    shareState.proc      = null;
  });
}

function stopTunnel() {
  if (shareState.proc) {
    try { shareState.proc.kill(); } catch(e) {}
    shareState.proc = null;
  }
  shareState.running   = false;
  shareState.tunnelUrl = null;
}

// ── Basic auth check ────────────────────────────────────────────────
function checkAuth(req) {
  if (!shareState.username || !shareState.password) return false;
  const h = req.headers['authorization'] || '';
  if (!h.startsWith('Basic ')) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString();
  const [u, ...rest] = decoded.split(':');
  return u === shareState.username && rest.join(':') === shareState.password;
}

function requireAuth(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="ComfyUI Studio"',
    'Content-Type': 'text/plain',
  });
  res.end('Unauthorized');
}

// ── Body reader ─────────────────────────────────────────────────────
function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ── ComfyUI proxy ───────────────────────────────────────────────────
function proxyToComfy(req, res, comfyPath) {
  const target = new URL(COMFY_URL + comfyPath);
  const lib    = target.protocol === 'https:' ? https : http;
  const chunks = [];

  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const opts = {
      hostname: target.hostname,
      port:     target.port || (target.protocol === 'https:' ? 443 : 80),
      path:     target.pathname + (target.search || ''),
      method:   req.method,
      headers:  { ...req.headers, host: target.host },
    };
    delete opts.headers['origin'];
    delete opts.headers['referer'];
    if (body.length) opts.headers['content-length'] = body.length;

    const proxy = lib.request(opts, pRes => {
      res.writeHead(pRes.statusCode, {
        ...pRes.headers,
        'access-control-allow-origin':  '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
      });
      pRes.pipe(res);
    });
    proxy.on('error', e => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ComfyUI unreachable', detail: e.message }));
    });
    if (body.length) proxy.write(body);
    proxy.end();
  });
}

// ── Static files ─────────────────────────────────────────────────────
function serveStatic(urlPath, res) {
  let filePath = path.join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(STATIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      filePath = path.join(STATIC_DIR, 'index.html');
      fs.stat(filePath, (e2, s2) => {
        if (e2 || !s2.isFile()) { res.writeHead(404); res.end('Not found'); return; }
        pipeFile(filePath, res);
      });
      return;
    }
    pipeFile(filePath, res);
  });
}

function pipeFile(filePath, res) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const s    = fs.createReadStream(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  s.pipe(res);
  s.on('error', () => res.end());
}

// ── Main handler ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // /comfy/* → proxy to ComfyUI
  if (pathname.startsWith('/comfy/')) {
    proxyToComfy(req, res, pathname.slice(6) + parsed.search);
    return;
  }

  // /share/* → tunnel control (local machine only)
  if (pathname === '/share/start' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (!body.username || !body.password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'username and password required' }));
      return;
    }
    if (shareState.running) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, already: true, url: shareState.tunnelUrl }));
      return;
    }
    shareState.username = body.username;
    shareState.password = body.password;
    startTunnel(`http://localhost:${PORT}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/share/stop' && req.method === 'POST') {
    stopTunnel();
    shareState.username = '';
    shareState.password = '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/share/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      running:   shareState.running,
      tunnelUrl: shareState.tunnelUrl,
      log:       shareState.log.slice(-20),
    }));
    return;
  }

  // Enforce Basic Auth for remote visitors coming through the tunnel
  const host     = req.headers['host'] || '';
  const isRemote = shareState.running &&
    !host.startsWith('localhost') &&
    !host.startsWith('127.') &&
    !host.startsWith('::1');

  if (isRemote && !checkAuth(req)) {
    requireAuth(res);
    return;
  }

  // /save — accepts { path, filename, dataUrl } or { filename, data (raw base64) }
  if (pathname === '/save' && req.method === 'POST') {
    try {
      const data   = JSON.parse((await readBody(req)).toString());
      const folder = (data.path || '').trim();
      const fname  = path.basename((data.filename || `image_${Date.now()}.png`).trim());
      const dest   = folder ? path.join(folder, fname) : path.join(OUTPUT_DIR, fname);

      // Accept data URL (data:image/...;base64,XXX) or raw base64
      let b64 = data.dataUrl || data.data || '';
      if (b64.includes(',')) b64 = b64.split(',')[1];

      if (folder) fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: dest }));
      console.log('[studio] Saved:', dest);
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // /list — accepts POST { path } or GET
  if (pathname === '/list' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      let folder = OUTPUT_DIR;
      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        if (body.path) folder = body.path.trim();
      }
      if (!fs.existsSync(folder)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ files: [] }));
        return;
      }
      const files = fs.readdirSync(folder)
        .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // /list-autocomplete — returns CSV filenames from "comfystudio autocomplete" folder
  if (pathname === '/list-autocomplete' && req.method === 'GET') {
    const acDir = path.join(STATIC_DIR, 'comfystudio autocomplete');
    let files = [];
    try {
      if (fs.existsSync(acDir)) files = fs.readdirSync(acDir).filter(f => /\.csv$/i.test(f)).sort();
    } catch(e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files }));
    return;
  }

  // /autocomplete-csv/:filename — serve a specific CSV from the autocomplete folder
  if (pathname.startsWith('/autocomplete-csv/') && req.method === 'GET') {
    const name = decodeURIComponent(pathname.slice('/autocomplete-csv/'.length));
    const safe = path.basename(name);
    if (!safe || !/\.csv$/i.test(safe)) { res.writeHead(400); res.end('Bad request'); return; }
    const filePath = path.join(STATIC_DIR, 'comfystudio autocomplete', safe);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      res.end(data);
    });
    return;
  }

  // /meta/push — host stores metadata for a prompt_id
  if (pathname === '/meta/push' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString());
      if (!body.prompt_id || !body.meta) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'prompt_id and meta required' }));
        return;
      }
      metaStore.set(body.prompt_id, body.meta);
      if (metaStore.size > META_STORE_MAX) {
        metaStore.delete(metaStore.keys().next().value);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // /meta/get?prompt_id=XXX — any client (including remote) can fetch metadata
  if (pathname === '/meta/get' && req.method === 'GET') {
    const promptId = parsed.searchParams.get('prompt_id');
    if (!promptId || !metaStore.has(promptId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ meta: metaStore.get(promptId) }));
    return;
  }

  // Static
  serveStatic(pathname, res);
});

server.listen(PORT, () => {
  console.log('\n  ✦ ComfyUI Studio\n');
  console.log(`  Studio  →  http://localhost:${PORT}`);
  console.log(`  ComfyUI →  ${COMFY_URL}  (proxied via /comfy/*)`);
  console.log(`  Outputs →  ${OUTPUT_DIR}`);
  console.log('\n  Press Ctrl+C to stop.\n');
});

// ── WebSocket upgrade proxy (/comfy/ws → ComfyUI) ────────────────────────
// Remote browsers connect to wss://tunnel-host/comfy/ws — we tunnel it as
// a raw TCP pipe directly to ComfyUI's WebSocket port.
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/comfy/')) { socket.destroy(); return; }

  const target    = new URL(COMFY_URL);
  const comfyPath = req.url.slice(6); // strip "/comfy"
  const comfyPort = parseInt(target.port) || 80;
  const comfyHost = target.hostname;

  const upstream = net.connect(comfyPort, comfyHost, () => {
    const headers = [
      `GET ${comfyPath} HTTP/1.1`,
      `Host: ${comfyHost}:${comfyPort}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
    ];
    for (const [k, v] of Object.entries(req.headers)) {
      const kl = k.toLowerCase();
      if (['upgrade', 'connection', 'host'].includes(kl)) continue;
      headers.push(`${k}: ${v}`);
    }
    headers.push('', '');
    upstream.write(headers.join('\r\n'));
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on('error', () => socket.destroy());
  socket.on('error',   () => upstream.destroy());
});

process.on('SIGINT',  () => { stopTunnel(); process.exit(0); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(0); });