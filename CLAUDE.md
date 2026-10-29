# Cosmic – Basiswissen für jede Session

Antworte dem Nutzer immer auf Deutsch (Code, Commit-Messages und Bezeichner bleiben englisch).

## Worum es geht
Cosmic ist eine Web-App für digitale Räume ("Spaces"): ein per Gaussian Splat erfasster 3D-Raum wird mit Aufgaben, Listen,
Dokumenten, Tags, Benachrichtigungen, Kalender und Wetter verknüpft.
Zentrales Domänenobjekt ist der **Space** (Mitgliedschaften, Floors, Rooms, Tags hängen daran).
Der **Splat-Viewer** (.spz + collision.glb, z. B. Spaitial-Importe) ist der Hauptweg. Dazu gehören Minimap, Space-Koordinatensystem
mit Kalibrierung und ein Start-Space pro Nutzer.
**Matterport wird perspektivisch ersetzt**: kein neuer Code und keine neuen Features dafür; Neues nur für den Splat-Viewer bauen.

## Repos (GitHub-Organisation `Graswald-Schaetzle`)
| Repo | Inhalt |
|---|---|
| `cosmic-webapp-frontend` | React-Frontend (aktuell) |
| `cosmic-backend` | Node/Express-API und Supabase-Migrationen |
| `cosmic-infra` | Infrastruktur (privat) |
| `cosmic-ios` | iOS-App |
| `cosmic` | älteres Repo |
| `cosmic-webapp-fe`, `cosmic-webapp-be`, `cosmic-webapp-infra` | Vorgänger, nicht mehr aktiv – nicht verwenden |

Aktuelle Arbeit passiert in `cosmic-webapp-frontend` und `cosmic-backend`. Default-Branch ist `main`.

## Stack
**Frontend**: React 18, TypeScript, Vite, MUI + Tailwind (v4, shadcn-Stil in `src/components/ui`, Icons: lucide und MUI-Icons),
Redux Toolkit/RTK Query, React Router, `three` + `@sparkjsdev/spark` für Splats.
Struktur nach Features in `src/features/*` (splat, spaces, reconstruction, tasks, documents, list, mattertag, notifications, calendar, dashboard, ...),
API-Layer in `src/api/*`, Kontexte in `src/contexts/*`.
Befehle: `npm install`, `npm run dev`, `npm run build` (= `tsc && vite build`), `npm run lint` (0 Warnings erlaubt),
`npm run type-check`, `npm run format`, `npm test` (vitest).

**Backend**: Node.js, Express-Monolith (`server.js`, Routen in `app/routes/*`), Supabase-Client,
JWT-Login (`/auth/login`), Swagger unter `/api-docs`. Befehle: `yarn install`, `yarn dev`, `yarn build`, `yarn start`.
Doku: `docs/architecture.md`, `docs/domain-model.md`, `docs/space-coordinate-system.md`, `docs/minimap.md`.

## Dienste & Konnektoren
- **Supabase**: Postgres + Storage. Projekt-Ref `haaaayxcejprzqjainzp` (`https://haaaayxcejprzqjainzp.supabase.co`).
  **Splat- und Mesh-Dateien liegen in Supabase Storage**, Bucket `splats` (z. B. `splats/imports/<name>/splat.spz` und `collision.glb`).
  Dokumente liegen im Bucket `documents`.
  Schema-Änderungen immer als Migration in `cosmic-backend/supabase/migrations/` (Dateiname `YYYYMMDDNNNNNN_beschreibung.sql`).
- **GitHub**: Code, PRs, Actions.
- **Vercel**: Frontend, Live-Version `https://cosmic-webapp-frontend.vercel.app` (Projekt `cosmic-webapp-frontend`).
- **Backend-Hosting: Google Cloud Run** (Projekt `cosmic-489720`, Region `europe-west4`, Dienst `cosmic-backend`,
  URL `https://cosmic-backend-701520654148.europe-west4.run.app`). Das Backend läuft NICHT in Supabase (dort gibt es keine Backend-Edge-Functions,
  nur DB und Storage). Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf `main` ein Docker-Image und deployt es automatisch.
  Das Frontend ruft diese URL auf (Stand 29.10.2026 im Live-Bundle auf Vercel bestätigt).
- Das Frontend wird ausschließlich über Vercel ausgeliefert (der frühere Cloud-Run-Workflow, `Dockerfile` und `nginx.conf` wurden entfernt).
- **Nicht mehr aktuell, nicht verwenden**: die RunPod-3D-Rekonstruktions-Pipeline (`worker/`, `infra/`, `docs/3d-pipeline.md`, Workflow `build-worker.yml`).
  Neue Splats kommen als Import (`scripts/import-splat-space.js`) nach Supabase Storage.
- Die MCP-Konnektoren (Supabase, GitHub, Vercel) werden in den Claude-Einstellungen verbunden, nicht in dieser Datei.

## Geheimnisse
Keine Keys, Passwörter oder Tokens in Dateien, Commits oder Chats schreiben. Sie liegen in GitHub-Secrets,
den Umgebungsvariablen der Dienste und der lokalen `.env` (nur Variablennamen siehe `.env.example`).
Frontend-Variablen mit `VITE_`-Präfix, u. a. `VITE_API_BASE_URL`.

## Arbeitsweise
- Änderungen direkt auf `main` committen und pushen (kein Feature-Branch, kein PR), außer der Nutzer verlangt ausdrücklich einen PR.
- Vor dem Push `npm run lint`, `npm run type-check` und `npm run build` (Frontend) laufen lassen.
- Kleine, gezielte Änderungen; bestehende Muster und Dateistruktur des jeweiligen Repos übernehmen.
- Wenn Frontend und Backend zusammenhängen (neuer Endpunkt, neue Spalte): Backend + Migration zuerst, dann Frontend.
- Jeder Push auf `main` deployt automatisch (Backend -> Cloud Run, Frontend -> Vercel): nur getestete Änderungen pushen.
- Vor dem Ändern von Datenbank oder Live-Diensten (Supabase, Vercel, Cloud Run) kurz sagen, was passiert, und bei Löschen/Überschreiben nachfragen.

## UI-Leitlinien (aus der bestehenden UI abgeleitet)
Die App ist ein **dunkler "Glas"-Look über dem 3D-Raum**: Panels schweben als halbtransparente Fenster über dem Splat.
- **Fenster/Panels**: Hintergrund `rgba(46, 46, 46, 0.35)` (Menüs/Popover `0.85`) mit `backdropFilter: blur(100px)`, kein Schatten (`boxShadow: none`),
  große Rundungen (Fenster `32px`, Menüs `16px`, Karten/Buttons `20px`, Chips/Pills und Tab-Leisten `100px`).
- **Text**: weiß (`#FFFFFF`), deaktiviert `rgba(255,255,255,0.3)`. Schrift Inter, sonst sans-serif.
  Überschriften 16 px / Gewicht 700, Fließtext und Buttons 14 px (Buttons Gewicht 600), Labels/Chips 11–12 px.
- **Flächen im Panel**: Tab-Leisten und Eingabefelder `rgba(0,0,0,0.15)`, Hover `rgba(255,255,255,0.15)`, aktiver Tab hell hinterlegt.
- **Farben**: Fehler/Löschen `#FF6B6B`; Raum-Chips orange `#FFA600`, Orte/Tags blau `#3380FF` (jeweils mit 25 % Deckkraft als Hintergrund);
  Status Erfolg `#34C759`, Warnung `#FF9500`, Gefahr `#FF3B30`.
- **Mobile-first**: Dialoge sind auf dem Handy Vollbild-Sheets von unten (`useIsMobile`, obere Ecken `24px`, `safe-area-inset-bottom` beachten);
  Minimap auf Handys ausgeblendet; keine überlappenden Menüs/Icons; Touch-Ziele groß genug.
- Neue Fenster über die vorhandene `Dialog`-Komponente (`src/components/Dialog.tsx`) und bestehende Fenster wie `MatterTagWindow` als Vorlage bauen,
  vorhandene Komponenten aus `src/components/ui` und MUI wiederverwenden, keine neue UI-Bibliothek einführen.
- Texte in der UI: Sprache wie in der jeweiligen Komponente bereits vorhanden, nicht mischen.
- Logo, Markenfarbe und Tonalität sind noch nicht festgelegt (im Code gibt es keine einheitliche Primärfarbe).

## Bekannte Stolpersteine
- Frontend-`README.md` ist teilweise veraltet (nennt Clerk und ein altes GitLab-Repo; tatsächlich läuft Login über das Backend/Supabase).
  `src/config.js` enthält noch eine alte Render-Backend-URL – maßgeblich ist `VITE_API_BASE_URL`.
- Das Wetter-Widget kann ohne Standortfreigabe `Failed to get location` loggen (harmlos).
- Browser-Screenshots der Splat-Ansicht können in der Cloud-Umgebung in ein Timeout laufen (WebGL); Logs und Netzwerk-Checks sind zuverlässiger.
