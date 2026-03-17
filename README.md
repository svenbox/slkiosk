# slkiosk — Branded Infoskärm

Modulär infoskärm för storskärm och Raspberry Pi. Brandas med egen logotyp, färg och QR-kod. Hämtar kollektivtrafikdata via samma proxy som [sltavla.soxbox.uk](https://sltavla.soxbox.uk).

## Innehåll

```
slkiosk/
├── kiosk.html          — infoskärmen (en fil, inga beroenden)
├── admin.html          — webbgränssnitt för att redigera infobandet
├── proxy.js            — CORS-proxy + GET/PUT för info.json
├── nginx.conf          — servar frontend, proxar /api/
├── Dockerfile          — nginx med kiosk.html + admin.html
├── Dockerfile.proxy    — Node.js med proxy.js
├── docker-compose.yml  — två containers + delad volym
├── deploy.sh           — bygg och starta om
└── .env.example        — miljövariabler
```

## Snabbstart

```bash
git clone https://github.com/DITT-ANVÄNDARNAMN/slkiosk.git
cd slkiosk
cp .env.example .env
# Redigera .env — sätt TL_API_KEY och ADMIN_PW
docker compose up -d
```

Kiosken körs på port **8088** i `mediastack`-nätverket.

## Uppdatera

```bash
./deploy.sh
```

## Miljövariabler (.env)

| Variabel      | Beskrivning                                          | Standard    |
|---------------|------------------------------------------------------|-------------|
| `TL_API_KEY`  | API-nyckel från [trafiklab.se](https://trafiklab.se) | —           |
| `ADMIN_PW`    | Lösenord för admin-gränssnittet                      | `kiosk2024` |

```bash
# .env
TL_API_KEY=din_trafiklab_nyckel_här
ADMIN_PW=byt_till_eget_lösenord
```

## SWAG — reverse proxy

Skapa `/config/nginx/proxy-confs/slkiosk.soxbox.uk.conf`:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name slkiosk.*;
    include /config/nginx/ssl.conf;
    client_max_body_size 0;
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

```bash
docker exec swag nginx -s reload
```

---

## Kiosken — kiosk.html

Hela infoskärmen i en enda HTML-fil. Konfigureras via URL-parametrar.

### URL-parametrar

| Parameter    | Beskrivning                                                          | Standard                              |
|--------------|----------------------------------------------------------------------|---------------------------------------|
| `stops`      | SL Stop-ID, kommaseparerade                                          | `9001`                                |
| `names`      | Visningsnamn per tavla, kommaseparerade                              | Stop-ID                               |
| `colors`     | Headerfärg per tavla: `blue` `red` `green` `orange` `dark`          | `blue`                                |
| `accent`     | Bakgrundsfärg runt modulerna (URI-encodad hex, t.ex. `%231a2535`)   | `#1a2535`                             |
| `accenttext` | Textfärg på bakgrunden                                               | `#ffffff`                             |
| `brand`      | URL till logotyp (PNG/SVG) — inverteras till vit automatiskt        | —                                     |
| `brandname`  | Företagsnamn i topbaren                                              | —                                     |
| `brandcolor` | `true` = visa logotypen i originalfärg (ej inverterad)              | `false`                               |
| `qr`         | URL som QR-koden pekar på                                            | `https://sltavla.soxbox.uk`           |
| `qrlabel`    | Text under QR-koden (`\n` = radbrytning)                            | `Öppna i\nmobilen`                    |
| `lat`        | Latitud för väder                                                    | `59.3293` (Stockholm)                 |
| `lon`        | Longitud för väder                                                   | `18.0686`                             |
| `proxy`      | URL till proxy-servern                                               | `https://sltavla.soxbox.uk/api/proxy` |
| `info`       | URL till info.json                                                   | `/info.json`                          |
| `rows`       | Max rader per tavla (0 = auto, rekommenderat max 5)                  | `0`                                   |

### Exempel-URL

```
https://slkiosk.soxbox.uk/?stops=740021691,740065553
  &names=Skarpnäck+T-bana,Horisontvägen
  &colors=blue,red
  &accent=%231a2535
  &brand=https://foretaget.se/logo.png
  &brandname=Företaget+AB
  &brandcolor=true
  &qr=https://foretaget.se
  &qrlabel=Besök+oss
  &lat=59.27
  &lon=18.13
  &proxy=https://sltavla.soxbox.uk/api/proxy
```

### Hitta Stop-ID

1. Gå till [sltavla.soxbox.uk](https://sltavla.soxbox.uk)
2. Skapa en tavla för hållplatsen
3. Öppna ⚙ Debug längst ner — Stop-ID syns i loggen

### Branding — exempel

| Stil | Parametrar |
|------|-----------|
| Mörk (standard) | `accent=%231a2535` |
| Företagsblå | `accent=%23003366&brand=https://…/logo.png&brandcolor=true` |
| Svart/vit logotyp | `accent=%23111111&brand=https://…/logo-white.svg` |
| Frisör | `accent=%23111111&brandname=Tre+Sax+%26+Kam&qrlabel=Boka+tid` |

---

## Admin — admin.html

Webbgränssnitt för att redigera infobandets meddelanden utan SSH.

### Öppna admin

```
https://slkiosk.soxbox.uk/admin.html?proxy=https://sltavla.soxbox.uk/api/proxy&kiosk=https://slkiosk.soxbox.uk
```

Logga in med lösenordet du satte i `.env` som `ADMIN_PW`.

### Funktioner

- Lägg till, redigera och ta bort meddelanden
- Drag & drop för att ändra ordning
- Förhandsvisning av tickern i realtid
- Sparar direkt till servern — kiosken uppdateras automatiskt inom 5 minuter
- Fallback: laddar ner `info.json` lokalt om servern inte svarar

### Flöde

```
admin.html  →  PUT /api/info (X-Admin-Password header)
            →  nginx proxy  →  slkiosk-proxy:3000/info
            →  proxy.js validerar lösenord + sparar till /data/info.json (Docker-volym)
            →  kiosk.html hämtar /info.json var 5:e minut
```

---

## info.json — infobandet

Redigera via admin-gränssnittet eller direkt på servern.

```json
[
  { "tag": "Info",  "text": "Lunch serveras i matsalen 11:30–13:30" },
  { "tag": "Möte",  "text": "Styrelsemöte fredag kl 14:00 i konferensrum B" },
  { "tag": "SL",    "text": "Förseningar linje 35 — beräknad normalisering 10:30" },
  { "tag": "Nyhet", "text": "Ny busslinje 174 från 15 mars — se sl.se" }
]
```

---

## Raspberry Pi — FullpageOS

Sätt `fullpageosDisplayUrl` till kiosk-URL:en:

```
https://slkiosk.soxbox.uk/?stops=STOP_ID&names=Hållplatsnamn&proxy=https://sltavla.soxbox.uk/api/proxy
```

Eller starta Chromium manuellt:

```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  "https://slkiosk.soxbox.uk/?stops=740021691&names=Skarpnäck+T-bana"
```

---

## Arkitektur

```
Webbläsare / Raspberry Pi
  └── https://slkiosk.soxbox.uk  (SWAG → slkiosk:8088)
        ├── /           → kiosk.html        (infoskärmen)
        ├── /admin.html → admin.html        (tickeradmin)
        ├── /api/proxy  → slkiosk-proxy:3000/       (avgångar)
        └── /api/info   → slkiosk-proxy:3000/info   (GET/PUT info.json)

slkiosk-proxy (Node.js)
  ├── GET  /              → CORS-proxy mot Trafiklab + SL API
  ├── GET  /info          → läser /data/info.json (Docker-volym)
  └── PUT  /info          → sparar /data/info.json (kräver X-Admin-Password)

Väder
  └── https://api.open-meteo.com  (gratis, ingen nyckel krävs)
```

## Relation till sltavla.soxbox.uk

| | sltavla | slkiosk |
|---|---|---|
| **Syfte** | Mobilapp, personliga tavlor | Infoskärm, storskärm, Raspberry Pi |
| **Branding** | Nej | Logotyp, bakgrundsfärg, QR-kod |
| **Infobandet** | Nej | info.json, redigerbar via admin |
| **Väder** | Nej | Open-Meteo (gratis) |
| **Admin** | Nej | admin.html med lösenord |
| **Konfiguration** | UI + localStorage | URL-parametrar |

## Prestanda (Raspberry Pi 4)

- En statisk HTML-fil — inga frameworks
- Avgångar uppdateras var 30s, staggerade 900ms/tavla
- Väder var 10 min
- Infobandet var 5 min
- Klocka tickar var 10s
- CPU: ~5–10% på Pi 4 i kiosk-läge
