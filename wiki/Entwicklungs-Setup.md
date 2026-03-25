# Entwicklungs-Setup – Backend

## Voraussetzungen

- Node.js 18+ ([Download](https://nodejs.org))
- yarn ([Installation](https://classic.yarnpkg.com/en/docs/install))
- Supabase-Account

## Installation

```bash
# Repository klonen
git clone https://github.com/Graswald-Schaetzle/cosmic-backend.git
cd cosmic-backend

# Abhängigkeiten installieren
yarn install
```

## Umgebungsvariablen

Erstelle eine `.env`-Datei (Kopie von `.env.example`):

```bash
cp .env.example .env
```

| Variable | Beschreibung |
|----------|-------------|
| `SUPABASE_URL` | Supabase-Projekt-URL |
| `SUPABASE_KEY` | Supabase Service-Key |
| `COOKIE_SECRET` | Zufälliger String für Cookie-Sicherheit |
| `PORT` | Server-Port (Standard: 4000) |
| `API_LOGIN` | Basic-Auth-Login |
| `API_PASS` | Basic-Auth-Passwort |
| `ACCESS_TOKEN_SECRET` | JWT Access Token Secret |
| `REFRESH_TOKEN_SECRET` | JWT Refresh Token Secret |
| `MATTERPORT_MODEL_ID` | Matterport Modell-ID |
| `MATTERPORT_API_KEY` | Matterport API-Key |
| `MATTERPORT_API_SECRET` | Matterport API-Secret |

## Entwicklungsserver starten

```bash
yarn dev
# → Server startet auf http://localhost:4000
# → API-Docs: http://localhost:4000/api-docs/
```

## Verfügbare Scripts

```bash
yarn dev      # Entwicklungsmodus (mit Hot-Reload)
yarn build    # Production Build (esbuild)
yarn start    # Production Server starten
```

## API-Dokumentation lokal

Nach dem Start ist die Swagger-Dokumentation verfügbar unter:
`http://localhost:4000/api-docs/`

## Supabase lokal (optional)

Für vollständige lokale Entwicklung kann Supabase lokal gestartet werden:
```bash
npx supabase start
```
