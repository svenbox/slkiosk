// proxy.js
// API-nyckel: TL_API_KEY=xxxx node proxy.js
// Admin-lösenord: ADMIN_PW=hemligt node proxy.js

const http  = require('http');
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

const PORT      = 3000;
const TL_API_KEY = process.env.TL_API_KEY || '';
const ADMIN_PW   = process.env.ADMIN_PW   || 'kiosk2024';
const INFO_PATH  = process.env.INFO_PATH  || path.join(__dirname, '..', 'html', 'info.json');

if (!TL_API_KEY) console.warn('⚠️  TL_API_KEY saknas');
console.log(`📁 info.json: ${INFO_PATH}`);
console.log(`🔑 Admin-lösenord satt: ${ADMIN_PW !== 'kiosk2024' ? 'ja (anpassat)' : 'nej (standard kiosk2024, byt med ADMIN_PW=xxx)'}`);

const ALLOWED_HOSTS = [
  'realtime-api.trafiklab.se',
  'transport.integration.sl.se',
];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed = url.parse(req.url, true);

  // ── GET /info – läs info.json ────────────────────────────
  if (req.method === 'GET' && parsed.pathname === '/info') {
    try {
      const data = fs.readFileSync(INFO_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  // ── PUT /info – spara info.json (kräver lösenord) ────────
  if (req.method === 'PUT' && parsed.pathname === '/info') {
    const pw = req.headers['x-admin-password'];
    if (pw !== ADMIN_PW) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Fel lösenord' }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 500000) { req.destroy(); return; }
    });
    req.on('end', () => {
      try {
        const parsed_body = JSON.parse(body);
        if (!Array.isArray(parsed_body)) throw new Error('Måste vara en array');
        for (const item of parsed_body) {
          if (typeof item.tag !== 'string' || typeof item.text !== 'string')
            throw new Error('Varje item måste ha tag (string) och text (string)');
        }
        // Atomic write: temp-fil → rename
        const tmp = INFO_PATH + '.tmp';
        fs.mkdirSync(path.dirname(INFO_PATH), { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify(parsed_body, null, 2), 'utf8');
        fs.renameSync(tmp, INFO_PATH);
        console.log(`[admin] info.json sparad: ${parsed_body.length} items`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, items: parsed_body.length }));
      } catch(e) {
        console.error('[admin] Fel:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Proxy: ?url=... ──────────────────────────────────────
  if (parsed.pathname === '/' || parsed.pathname === '') {
    const target = parsed.query.url;
    if (!target) { res.writeHead(400); res.end(JSON.stringify({ error: 'Saknar ?url=' })); return; }

    let targetUrl;
    try { targetUrl = new URL(target); } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'Ogiltig URL' })); return;
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      res.writeHead(403); res.end(JSON.stringify({ error: 'Host ej tillåten: ' + targetUrl.hostname })); return;
    }

    if (targetUrl.hostname === 'realtime-api.trafiklab.se') {
      targetUrl.searchParams.set('key', TL_API_KEY);
    }

    console.log(`[proxy] → ${targetUrl.hostname}${targetUrl.pathname}`);

    const options = {
      hostname: targetUrl.hostname,
      path: targetUrl.pathname + targetUrl.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'avgangstavla-proxy/1.0' }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      console.log(`[proxy] ← ${proxyRes.statusCode}`);
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      console.error('[proxy] Fel:', e.message);
      res.writeHead(502); res.end(JSON.stringify({ error: e.message }));
    });

    proxyReq.end();
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`✅ Proxy + admin körs på http://localhost:${PORT}`);
});
