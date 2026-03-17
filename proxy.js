// proxy.js — slkiosk proxy + kiosk API
// Env: TL_API_KEY, ADMIN_PW, DATA_DIR

const http  = require('http');
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

const PORT     = parseInt(process.env.PORT || '3000');
const TL_KEY   = process.env.TL_API_KEY || '';
const ADMIN_PW = process.env.ADMIN_PW   || 'kiosk2024';
const DATA_DIR = process.env.DATA_DIR   || '/data/kiosks';

if (!TL_KEY)   console.warn('⚠️  TL_API_KEY saknas');
if (ADMIN_PW === 'kiosk2024') console.warn('⚠️  Standardlösenord används — byt ADMIN_PW i .env');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────
const ALLOWED_TL = ['realtime-api.trafiklab.se', 'transport.integration.sl.se', 'journeyplanner.integration.sl.se'];

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function readJSON(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return fallback; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function slugOk(slug) {
  return /^[a-z0-9_-]{1,60}$/.test(slug);
}

function authOk(req) {
  return req.headers['x-admin-password'] === ADMIN_PW;
}

function readBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    req.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > maxBytes) reject(new Error('Too large'));
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function listKiosks() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(d => fs.statSync(path.join(DATA_DIR, d)).isDirectory())
      .map(slug => {
        const cfg = readJSON(path.join(DATA_DIR, slug, 'config.json'), {});
        return { slug, brandname: cfg.brandname || slug, accent: cfg.accent || '#1a2535' };
      });
  } catch(e) { return []; }
}

// ── Default config template ────────────────────────────────
function defaultConfig(slug) {
  return {
    slug,
    brandname:   slug.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
    accent:      '#1a2535',
    accenttext:  '#ffffff',
    brand:       '',
    brandcolor:  false,
    qr:          '',
    qrlabel:     'Öppna i\nmobilen',
    stops:       [],
    stopNames:   [],
    colors:      [],
    icons:       [],
    lat:         59.3293,
    lon:         18.0686,
    proxy:       'https://sltavla.soxbox.uk/api/proxy',
  };
}

function defaultInfo() {
  return [
    { tag: 'Info', text: 'Välkommen! Skanna QR-koden för mer information.' },
    { tag: 'SL',   text: 'Avgångsinformation via Trafiklab · trafiklab.se · CC BY 4.0' },
  ];
}

// ── Logo normaliser (server-side, base64 in/out) ───────────
function normaliseSVG(svgText) {
  // Remove width/height attributes from root SVG, keep viewBox
  let s = svgText.trim();

  // Ensure viewBox exists — if not, try to derive from width/height
  if (!s.includes('viewBox')) {
    const wm = s.match(/\bwidth=["']([0-9.]+)/);
    const hm = s.match(/\bheight=["']([0-9.]+)/);
    if (wm && hm) {
      s = s.replace(/<svg/, `<svg viewBox="0 0 ${wm[1]} ${hm[1]}"`);
    }
  }

  // Remove fixed width/height from root SVG element (allow CSS to control size)
  s = s.replace(/(<svg[^>]*?)\s+width=["'][^"']*["']/g, '$1');
  s = s.replace(/(<svg[^>]*?)\s+height=["'][^"']*["']/g, '$1');

  // Replace hard-coded black/dark fills with currentColor so CSS invert works
  s = s.replace(/fill=["']#(000000|000|1[a-f0-9]{5}|2[a-f0-9]{5})["']/gi, 'fill="currentColor"');
  s = s.replace(/fill=["']black["']/gi, 'fill="currentColor"');

  return s;
}

// ── Server ─────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed  = url.parse(req.url, true);
  const parts   = parsed.pathname.replace(/^\//, '').split('/');
  const method  = req.method;

  // ── GET /api/kiosks ──────────────────────────────────────
  if (method === 'GET' && parts[0] === 'kiosks' && !parts[1]) {
    return json(res, 200, listKiosks());
  }

  // ── POST /api/kiosk — create new ────────────────────────
  if (method === 'POST' && parts[0] === 'kiosk' && !parts[1]) {
    if (!authOk(req)) return json(res, 401, { error: 'Ej autentiserad' });
    try {
      const body = JSON.parse(await readBody(req));
      const slug = (body.slug || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
      if (!slugOk(slug)) return json(res, 400, { error: 'Ogiltigt slug' });
      const dir = path.join(DATA_DIR, slug);
      if (fs.existsSync(dir)) return json(res, 409, { error: 'Kiosk finns redan' });
      const cfg = { ...defaultConfig(slug), ...body, slug };
      writeJSON(path.join(dir, 'config.json'), cfg);
      writeJSON(path.join(dir, 'info.json'), defaultInfo());
      console.log(`[api] Ny kiosk: ${slug}`);
      return json(res, 201, { slug, ok: true });
    } catch(e) { return json(res, 400, { error: e.message }); }
  }

  // ── Routes that require :slug ────────────────────────────
  if (parts[0] === 'kiosk' && parts[1]) {
    const slug    = parts[1];
    const sub     = parts[2]; // config | info | logo
    const dir     = path.join(DATA_DIR, slug);
    const cfgFile = path.join(dir, 'config.json');
    const infoFile= path.join(dir, 'info.json');

    if (!slugOk(slug)) return json(res, 400, { error: 'Ogiltigt slug' });

    // GET config
    if (method === 'GET' && sub === 'config') {
      const cfg = readJSON(cfgFile);
      if (!cfg) return json(res, 404, { error: 'Kiosk finns inte' });
      return json(res, 200, cfg);
    }

    // GET info
    if (method === 'GET' && sub === 'info') {
      const info = readJSON(infoFile, defaultInfo());
      return json(res, 200, info);
    }

    // PUT config
    if (method === 'PUT' && sub === 'config') {
      if (!authOk(req)) return json(res, 401, { error: 'Ej autentiserad' });
      try {
        const body = JSON.parse(await readBody(req));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const existing = readJSON(cfgFile, defaultConfig(slug));
        writeJSON(cfgFile, { ...existing, ...body, slug });
        console.log(`[api] Config sparad: ${slug}`);
        return json(res, 200, { ok: true });
      } catch(e) { return json(res, 400, { error: e.message }); }
    }

    // PUT info
    if (method === 'PUT' && sub === 'info') {
      if (!authOk(req)) return json(res, 401, { error: 'Ej autentiserad' });
      try {
        const body = JSON.parse(await readBody(req));
        if (!Array.isArray(body)) throw new Error('Måste vara array');
        for (const it of body) {
          if (typeof it.tag !== 'string' || typeof it.text !== 'string')
            throw new Error('Varje item kräver tag och text');
        }
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        writeJSON(infoFile, body);
        console.log(`[api] Info sparad: ${slug} (${body.length} items)`);
        return json(res, 200, { ok: true });
      } catch(e) { return json(res, 400, { error: e.message }); }
    }

    // POST logo — base64 encoded SVG or PNG
    if (method === 'POST' && sub === 'logo') {
      if (!authOk(req)) return json(res, 401, { error: 'Ej autentiserad' });
      try {
        const body = JSON.parse(await readBody(req));
        const { data, type } = body; // type: 'svg' | 'png' | 'webp'
        if (!data || !type) throw new Error('Saknar data eller type');

        let ext, finalData;
        if (type === 'svg') {
          // Normalise SVG
          const svgText = Buffer.from(data, 'base64').toString('utf8');
          finalData = Buffer.from(normaliseSVG(svgText)).toString('base64');
          ext = 'svg';
        } else if (type === 'png' || type === 'webp' || type === 'jpeg' || type === 'jpg') {
          finalData = data;
          ext = type === 'jpeg' ? 'jpg' : type;
        } else {
          throw new Error('Ogiltigt filformat — accepterar svg, png, webp');
        }

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const logoFile = path.join(dir, `logo.${ext}`);

        // Remove old logos
        ['svg','png','webp','jpg'].forEach(e => {
          const f = path.join(dir, `logo.${e}`);
          if (fs.existsSync(f)) fs.unlinkSync(f);
        });

        fs.writeFileSync(logoFile, Buffer.from(finalData, 'base64'));

        // Update config with logo path
        const cfg = readJSON(cfgFile, defaultConfig(slug));
        cfg.logoFile = `logo.${ext}`;
        cfg.logoExt  = ext;
        writeJSON(cfgFile, cfg);

        console.log(`[api] Logo sparad: ${slug}/logo.${ext}`);
        return json(res, 200, { ok: true, file: `logo.${ext}`, data: finalData, ext });
      } catch(e) { return json(res, 400, { error: e.message }); }
    }

    // GET logo
    if (method === 'GET' && sub === 'logo') {
      const cfg = readJSON(cfgFile, {});
      const ext = cfg.logoExt;
      if (!ext) return json(res, 404, { error: 'Ingen logotyp uppladdad' });
      const logoFile = path.join(dir, `logo.${ext}`);
      if (!fs.existsSync(logoFile)) return json(res, 404, { error: 'Logofil saknas' });
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'max-age=3600', 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(logoFile).pipe(res);
      return;
    }

    // DELETE kiosk
    if (method === 'DELETE' && !sub) {
      if (!authOk(req)) return json(res, 401, { error: 'Ej autentiserad' });
      if (!fs.existsSync(dir)) return json(res, 404, { error: 'Kiosk finns inte' });
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[api] Kiosk borttagen: ${slug}`);
      return json(res, 200, { ok: true });
    }
  }

  // ── Trafiklab proxy (?url=...) ───────────────────────────
  if (parsed.query.url) {
    let targetUrl;
    try { targetUrl = new URL(parsed.query.url); }
    catch(e) { return json(res, 400, { error: 'Ogiltig URL' }); }

    if (!ALLOWED_TL.includes(targetUrl.hostname))
      return json(res, 403, { error: 'Host ej tillåten: ' + targetUrl.hostname });

    if (targetUrl.hostname === 'realtime-api.trafiklab.se')
      targetUrl.searchParams.set('key', TL_KEY);

    const opts = {
      hostname: targetUrl.hostname,
      path: targetUrl.pathname + targetUrl.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'slkiosk-proxy/2.0' }
    };
    const proxyReq = https.request(opts, proxyRes => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });
    proxyReq.on('error', e => json(res, 502, { error: e.message }));
    proxyReq.end();
    return;
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`✅ slkiosk proxy+api på port ${PORT}`);
  console.log(`   DATA_DIR: ${DATA_DIR}`);
  console.log(`   ADMIN_PW: ${ADMIN_PW !== 'kiosk2024' ? '*** (anpassat)' : 'kiosk2024 (standard — byt!)'}`);
});
