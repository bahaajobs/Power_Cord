import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';

import { config } from './config.js';
import { logger } from './log.js';
import { seedAdmin, userForToken } from './db.js';
import { reapStale, snapshot } from './devices.js';
import { bridgeStatus, connectBridge } from './bridge.js';
import { pruneSamples } from './energy.js';
import { tick } from './scheduler.js';
import { handleApi, tokenFrom } from './api.js';

const log = logger('server');
const MAX_BODY = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

/* ------------------------------------------------------------------- boot */

const generated = seedAdmin();
if (generated) {
  log.warn('─'.repeat(64));
  log.warn(`First run: created user "${config.adminUser}" with password  ${generated}`);
  log.warn('Write it down — it is not stored in readable form and not shown again.');
  log.warn('─'.repeat(64));
}

/* -------------------------------------------------------------- websocket */

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

function broadcast(extra = {}) {
  if (clients.size === 0) return;
  const payload = JSON.stringify({
    type: 'state', ...snapshot(), mqtt: bridgeStatus(), ...extra,
  });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// Coalesce bursts: a "turn all on" produces five state messages in a few
// milliseconds and the UI only needs the settled result.
let pendingBroadcast = null;
function scheduleBroadcast(extra) {
  if (extra?.commandFailed) return broadcast(extra);
  if (pendingBroadcast) return;
  pendingBroadcast = setTimeout(() => { pendingBroadcast = null; broadcast(); }, 120);
}

/* ------------------------------------------------------------------ HTTP */

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolvePromise(null);
      try { resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  // Resolve inside the web root and verify containment, so `..` in a URL
  // cannot walk out of it.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = resolve(join(config.webRoot, rel));
  if (!file.startsWith(resolve(config.webRoot))) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  // Unknown paths fall through to the app shell so client-side routes work.
  if (!existsSync(file)) file = join(config.webRoot, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
      .end(`web root not found at ${config.webRoot}`);
    return;
  }

  const ext = extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    try {
      const handled = await handleApi(req, res, url, () => readBody(req));
      if (handled) return;
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: err.message }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: 'no such endpoint' }));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('method not allowed');
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  if (!userForToken(tokenFrom(req, url))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.send(JSON.stringify({ type: 'state', ...snapshot(), mqtt: bridgeStatus() }));
  });
});

/* ------------------------------------------------------------------ loops */

connectBridge(scheduleBroadcast);

setInterval(() => {
  if (reapStale() > 0) scheduleBroadcast();
  tick(scheduleBroadcast);
}, config.tickIntervalMs);

setInterval(() => {
  const removed = pruneSamples();
  if (removed) log.info(`pruned ${removed} raw samples older than ${config.rawRetentionHours}h`);
}, 3_600_000);

server.listen(config.port, config.host, () => {
  log.info(`http://${config.host}:${config.port}  (web root ${config.webRoot})`);
  log.info(`broker ${config.mqttUrl}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info(`${sig} — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
