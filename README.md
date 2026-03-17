# slkiosk v2

Modulär infoskärm för storskärm och Raspberry Pi. Stöder flera kiosker per server, var och en med egen branding, hållplatser och infobands-innehåll.

## Innehåll

```
slkiosk/
├── kiosk.html       — infoskärmen (läser config från /api/kiosk/:slug)
├── admin.html       — central adminpanel för alla kiosker
├── proxy.js         — API + CORS-proxy (Node.js)
├── nginx.conf       — slug-routing + API-proxy
├── Dockerfile       — nginx frontend
├── Dockerfile.proxy — Node.js backend
├── docker-compose.yml
├── deploy.sh
└── .env.example
```

## Snabbstart

```bash
git clone https://github.com/DITT-ANVÄNDARNAMN/slkiosk.git
cd slkiosk
cp .env.example .env
# Redigera .env
docker compose up -d
```

## Miljövariabler (.env)

| Variabel     | Beskrivning                          | Standard    |
|--------------|--------------------------------------|-------------|
| `TL_API_KEY` | API-nyckel från trafiklab.se         | —           |
| `ADMIN_PW`   | Lösenord för admin-panelen           | `kiosk2024` |

## URLs

| URL | Beskrivning |
|-----|-------------|
| `/admin` | Central adminpanel |
| `/:slug` | Kiosk-display, t.ex. `/skarpnacks_frisor` |

## Admin

Öppna `https://slkiosk.soxbox.uk/admin` och logga in med `ADMIN_PW`.

### Skapa en kiosk

1. Klicka **Ny kiosk**
2. Ange organisationsnamn → slug genereras automatiskt
3. Redigera branding, hållplatser och infobandet
4. Spara

### Logo-uppladdning

Admin-sidan accepterar SVG, PNG, WebP och JPEG upp till 2 MB.

- **SVG**: rensas automatiskt — `width`/`height` tas bort, hårda svarta `fill`-färger ersätts med `currentColor` för att fungera med CSS-inversion
- **PNG/JPEG/WebP**: normaliseras via Canvas, konverteras till WebP, skalas ner till max 600px om nödvändigt

Toggla "Originalfärger" för att visa logotypen utan vit inversion (för färgade logotyper på mörk bakgrund).

## Data-struktur

Varje kiosk lagras som en mapp i Docker-volymen `slkiosk-data`:

```
/data/kiosks/
  skarpnacks_frisor/
    config.json    — branding, hållplatser, koordinater
    info.json      — ticker-meddelanden
    logo.svg       — logotyp (valfritt)
```

### config.json

```json
{
  "slug":       "skarpnacks_frisor",
  "brandname":  "Skarpnäcks Frisör",
  "accent":     "#1a2535",
  "accenttext": "#ffffff",
  "brandcolor": false,
  "qr":         "https://foretaget.se",
  "qrlabel":    "Boka tid",
  "stops":      ["740045499", "740065553"],
  "stopNames":  ["Skarpnäck T-bana", "Horisontvägen"],
  "colors":     ["blue", "red"],
  "icons":      ["METRO", "BUS"],
  "lat":        59.33,
  "lon":        18.06,
  "proxy":      "https://sltavla.soxbox.uk/api/proxy",
  "logoFile":   "logo.svg",
  "logoExt":    "svg"
}
```

### info.json

```json
[
  { "tag": "Info", "text": "Lunch serveras 11:30–13:30" },
  { "tag": "Möte", "text": "Styrelsemöte fredag kl 14:00" }
]
```

Redigera direkt med nano om du föredrar det:
```bash
docker exec -it slkiosk-proxy sh
nano /data/kiosks/skarpnacks_frisor/info.json
```

## Raspberry Pi

Sätt FullpageOS `fullpageosDisplayUrl` till:
```
https://slkiosk.soxbox.uk/skarpnacks_frisor
```

## SWAG

`/config/nginx/proxy-confs/slkiosk.soxbox.uk.conf`:
```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name slkiosk.*;
    include /config/nginx/ssl.conf;
    client_max_body_size 5m;
    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;
        set $upstream_app slkiosk;
        set $upstream_port 8088;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

## API

| Method | Path | Auth | Beskrivning |
|--------|------|------|-------------|
| GET | `/api/kiosks` | — | Lista alla kiosker |
| POST | `/api/kiosk` | ✓ | Skapa ny kiosk |
| GET | `/api/kiosk/:slug/config` | — | Hämta config |
| PUT | `/api/kiosk/:slug/config` | ✓ | Spara config |
| GET | `/api/kiosk/:slug/info` | — | Hämta ticker |
| PUT | `/api/kiosk/:slug/info` | ✓ | Spara ticker |
| POST | `/api/kiosk/:slug/logo` | ✓ | Ladda upp logo (base64 JSON) |
| GET | `/api/kiosk/:slug/logo` | — | Hämta logo-fil |
| DELETE | `/api/kiosk/:slug` | ✓ | Ta bort kiosk |

Auth = `X-Admin-Password`-header med `ADMIN_PW`.

## Relation till sltavla.soxbox.uk

| | sltavla | slkiosk |
|---|---|---|
| Syfte | Mobilapp, personliga tavlor | Infoskärm, storskärm, Pi |
| Konfiguration | UI + localStorage | Admin-panel + config.json |
| Flera instanser | Per användare | Per slug/organisation |
| Branding | Nej | Ja — logotyp, färg, QR |
| Infobandet | Nej | Ja — redigerbart via admin |
