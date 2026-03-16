# SL Kiosk — Branded Infoskärm

En modulär infoskärm för storskärm och Raspberry Pi. Konfigureras helt via URL-parametrar — ingen installation behövs.

## Filer

```
kiosk.html   — hela infoskärmen, en fil
info.json    — infobandets meddelanden
```

## Lägg in i Docker

```nginx
# nginx — lägg i samma container som sltavla.soxbox.uk
location /kiosk {
    alias /var/www/kiosk;
    try_files $uri $uri/ =404;
    add_header Cache-Control "no-cache";
}
```

## URL-parametrar

```
https://din-server/kiosk/kiosk.html?stops=9001,9180&names=T-Centralen,Fridhemsplan&...
```

| Parameter    | Beskrivning                                              | Standard                   |
|--------------|----------------------------------------------------------|----------------------------|
| `stops`      | SL Stop-ID, kommaseparerade                              | `9001`                     |
| `names`      | Visningsnamn per tavla, kommaseparerade                  | Stop-ID                    |
| `colors`     | Headerfärg per tavla: `blue` `red` `green` `orange` `dark` | `blue`                  |
| `accent`     | Bakgrundsfärg (URI-encodad hex, t.ex. `%23003366`)       | `#1a2535`                  |
| `accenttext` | Textfärg på bakgrunden                                   | `#ffffff`                  |
| `brand`      | URL till logotyp (PNG/SVG)                               | –                          |
| `brandname`  | Företagets namn i topbaren                               | –                          |
| `brandcolor` | `true` = visa logotypen i originalfärg (ej vit)          | `false`                    |
| `qr`         | URL som QR-koden pekar på                                | `https://sltavla.soxbox.uk`|
| `qrlabel`    | Text under QR-koden (`\n` = radbrytning)                 | `Öppna i\nmobilen`         |
| `lat`        | Latitud för väder                                        | `59.3293` (Stockholm)      |
| `lon`        | Longitud för väder                                       | `18.0686`                  |
| `proxy`      | URL till proxy-servern                                   | `/api/proxy`               |
| `info`       | URL till info.json                                       | `/info.json`               |
| `rows`       | Max rader per tavla (0 = auto)                           | `0`                        |

## Exempelkonfiguration — Företag X

```
kiosk.html
  ?stops=9001,9180
  &names=T-Centralen,Fridhemsplan
  &colors=blue,red
  &accent=%23003366
  &accenttext=%23ffffff
  &brand=https://foretaget.se/logotyp.png
  &brandname=F%C3%B6retaget+AB
  &brandcolor=true
  &qr=https://foretaget.se
  &qrlabel=Bes%C3%B6k+oss
  &lat=59.33
  &lon=18.06
  &proxy=https://sltavla.soxbox.uk/api/proxy
  &info=https://foretaget.se/kiosk/info.json
```

## info.json

Placera på valfri server. Kiosken hämtar ny data var 5:e minut.

```json
[
  { "tag": "Info",  "text": "Lunch serveras i matsalen 11:30–13:30" },
  { "tag": "Möte",  "text": "Styrelsemöte fredag kl 14:00 i konferensrum B" },
  { "tag": "SL",    "text": "Förseningar linje 35 — beräknad normalisering 10:30" },
  { "tag": "Nyhet", "text": "Kontoret stängt röda dagar i påsk" }
]
```

## Hitta Stop-ID

1. Gå till [sltavla.soxbox.uk](https://sltavla.soxbox.uk)
2. Skapa en tavla för din hållplats
3. Öppna ⚙ Debug längst ner — Stop-ID syns i loggen

Alternativt: sök på [Trafiklab Stop Lookup](https://www.trafiklab.se).

## Raspberry Pi — FullpageOS

Sätt `fullpageosDisplayUrl` i FullpageOS till din kiosk-URL:

```
http://din-server/kiosk/kiosk.html?stops=9001,9180&...
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
  "http://din-server/kiosk/kiosk.html?stops=9001&names=T-Centralen"
```

## Relation till sltavla.soxbox.uk

| | SL Tavla | SL Kiosk |
|---|---|---|
| Syfte | Mobilapp, personliga tavlor | Infoskärm, storskärm, Pi |
| API | Trafiklab via proxy | Samma proxy |
| Branding | Nej | Logotyp, färg, QR |
| Väder | Nej | Open-Meteo (gratis) |
| Infobandet | Nej | info.json |
| Konfiguration | UI + localStorage | URL-parametrar |

## Prestanda (Raspberry Pi 4)

- En statisk HTML-fil — noll beroenden att underhålla
- Avgångar uppdateras var 30s, staggerade 900ms/tavla
- Väder var 10 min (Open-Meteo, gratis, ingen nyckel)
- Ticker var 5 min
- Klocka tickar var 10s (räcker för HH:MM)
- CPU: ~5–10% på Pi 4 i kiosk-läge
