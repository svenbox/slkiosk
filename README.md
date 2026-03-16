# SL Kiosk — Branded Infoskärm

Modulär infoskärm för storskärm och Raspberry Pi. Konfigureras via URL-parametrar — ingen databas, ingen inloggning.

Hämtar kollektivtrafikdata via samma proxy som [sltavla.soxbox.uk](https://sltavla.soxbox.uk).

## Snabbstart

```bash
git clone https://github.com/ditt-repo/sl-kiosk.git
cd sl-kiosk
docker compose up -d
```

Kiosken körs på port 80 i `mediastack`-nätverket.  
Caddy/nginx sätter upp `svenskiosk.soxbox.uk` precis som för sltavla.

## Uppdatera

```bash
./deploy.sh
```

## Konfiguration — URL-parametrar

Öppna kiosken med parametrar för att konfigurera den:

```
https://svenskiosk.soxbox.uk/?stops=9001,9180&names=T-Centralen,Fridhemsplan&colors=blue,red&accent=%231a2535&brand=https://foretaget.se/logo.png&brandname=Företaget+AB&qr=https://foretaget.se&lat=59.33&lon=18.06&proxy=https://sltavla.soxbox.uk/api/proxy
```

| Parameter    | Beskrivning                                                        | Standard                    |
|--------------|--------------------------------------------------------------------|-----------------------------|
| `stops`      | SL Stop-ID, kommaseparerade                                        | `9001`                      |
| `names`      | Visningsnamn per tavla, kommaseparerade                            | Stop-ID                     |
| `colors`     | Headerfärg per tavla: `blue` `red` `green` `orange` `dark`        | `blue`                      |
| `accent`     | Bakgrundsfärg runt modulerna (URI-encodad hex, t.ex. `%231a2535`) | `#1a2535`                   |
| `accenttext` | Textfärg på bakgrunden                                             | `#ffffff`                   |
| `brand`      | URL till logotyp (PNG/SVG) — inverteras till vit automatiskt      | –                           |
| `brandname`  | Företagets namn i topbaren                                         | –                           |
| `brandcolor` | `true` = visa logotypen i originalfärg (ej inverterad)            | `false`                     |
| `qr`         | URL som QR-koden pekar på                                          | `https://sltavla.soxbox.uk` |
| `qrlabel`    | Text under QR-koden (`\n` = radbrytning)                          | `Öppna i\nmobilen`          |
| `lat`        | Latitud för väder                                                  | `59.3293` (Stockholm)       |
| `lon`        | Longitud för väder                                                 | `18.0686`                   |
| `proxy`      | URL till SL Tavla-proxyn                                           | `https://sltavla.soxbox.uk/api/proxy` |
| `info`       | URL till info.json                                                 | `/info.json`                |
| `rows`       | Max rader per tavla (0 = auto)                                     | `0`                         |

### Hitta Stop-ID

1. Gå till [sltavla.soxbox.uk](https://sltavla.soxbox.uk)
2. Skapa en tavla för hållplatsen
3. Öppna ⚙ Debug — Stop-ID syns i loggen

## Infobandet — info.json

Redigera `info.json` direkt på servern. Kiosken hämtar ny data var 5:e minut utan omstart.

```json
[
  { "tag": "Info",  "text": "Lunch serveras i matsalen 11:30–13:30" },
  { "tag": "Möte",  "text": "Styrelsemöte fredag kl 14:00 i konferensrum B" },
  { "tag": "SL",    "text": "Förseningar linje 35 — beräknad normalisering 10:30" }
]
```

Uppdatera utan rebuild:
```bash
# Redigera direkt i containern
docker exec -it sl-kiosk sh -c 'cat > /usr/share/nginx/html/info.json' < info.json

# Eller via SSH om filen finns på servern
scp info.json user@server:/path/to/sl-kiosk/info.json
docker compose restart sl-kiosk
```

## Raspberry Pi — FullpageOS

Sätt `fullpageosDisplayUrl` till kiosk-URL:en med parametrar:

```
https://svenskiosk.soxbox.uk/?stops=9001,9180&names=T-Centralen,Fridhemsplan&proxy=https://sltavla.soxbox.uk/api/proxy
```

Eller manuellt med Chromium:
```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  "https://svenskiosk.soxbox.uk/?stops=9001&names=T-Centralen"
```

## Arkitektur

```
Raspberry Pi / Webbläsare
  └── https://svenskiosk.soxbox.uk  (Caddy → sl-kiosk container)
        ├── kiosk.html   — hela appen, en fil
        └── info.json    — infobandets innehåll

Avgångsdata hämtas direkt från:
  └── https://sltavla.soxbox.uk/api/proxy  (befintlig proxy)
        ├── Trafiklab Realtime API  (primär)
        └── SL Transport API        (fallback)

Väder hämtas direkt från:
  └── https://api.open-meteo.com  (gratis, ingen nyckel)
```

## Branding — exempelkonfigurationer

### Mörk (standard)
```
?accent=%231a2535&accenttext=%23ffffff
```

### Företagsblå
```
?accent=%23003366&accenttext=%23ffffff&brand=https://foretaget.se/logo.png&brandcolor=true
```

### Svart med vit logotyp
```
?accent=%23111111&accenttext=%23ffffff&brand=https://foretaget.se/logo-white.svg
```
