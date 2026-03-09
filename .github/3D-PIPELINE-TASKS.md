# 3D Pipeline: Aufgaben-Übersicht

Dieses Dokument beschreibt alle Tasks für die 3D-Rekonstruktions-Pipeline.
Jede Phase kann als GitHub Issue angelegt werden.

---

## Phase 1: Docker Container + lokaler Test

**Ziel:** Pipeline funktioniert End-to-End auf einem Test-Video.

### Erledigte Tasks (im Code vorhanden)
- [x] Dockerfile mit CUDA 12.1, COLMAP, Nerfstudio (`worker/docker/Dockerfile`)
- [x] Python Pipeline-Script (`worker/pipeline/pipeline.py`)
- [x] Entrypoint-Script (`worker/scripts/entrypoint.sh`)
- [x] Supabase-Migration für `reconstruction_jobs` (`supabase/migrations/20260309000001_reconstruction_jobs.sql`)
- [x] Backend API Routes (`app/routes/reconstructionRoute.js`)
- [x] GCS + Cloud Batch Resolver (`app/resolvers/reconstructionResolver.js`)

### Offene Tasks
- [ ] Docker-Image lokal bauen: `docker build -t cosmic-3d-worker -f worker/docker/Dockerfile worker/`
- [ ] Test-Video aufnehmen (2 Min Innenraum, langsamer Walkthrough)
- [ ] Pipeline lokal testen: `docker run --gpus all ...`
- [ ] Output (.ply) in einem Web-Viewer validieren (z.B. antimatter15/splat)
- [ ] Docker-Image zu GCP Artifact Registry pushen

**Geschätzte Dauer:** 1-2 Wochen

---

## Phase 2: Backend API + Cloud Batch Integration

**Ziel:** Video über API hochladen, GPU-Job automatisch starten.

### Tasks
- [ ] GCP-Projekt konfigurieren:
  - [ ] Cloud Storage Bucket `cosmic-3d-pipeline` erstellen
  - [ ] CORS für den Bucket konfigurieren (signed URL uploads)
  - [ ] Cloud Batch API aktivieren
  - [ ] Artifact Registry Repository erstellen
  - [ ] Service Account mit nötigen Rollen erstellen
- [ ] `npm install` für `@google-cloud/storage` und `@google-cloud/batch`
- [ ] `.env` mit GCP-Credentials befüllen
- [ ] Backend API testen:
  - [ ] `POST /reconstruction-jobs` - Job erstellen + Upload-URL erhalten
  - [ ] Video zu GCS hochladen (via signed URL)
  - [ ] `POST /reconstruction-jobs/:id/start` - Cloud Batch Job starten
  - [ ] `GET /reconstruction-jobs/:id` - Status polling testen
  - [ ] Callback vom Worker verifizieren
- [ ] Supabase-Migration auf Produktion ausführen

**Geschätzte Dauer:** 1-2 Wochen

---

## Phase 3: Splat-Viewer im Frontend

**Ziel:** Gaussian Splat im React-Frontend anzeigen.

### Tasks
- [ ] Viewer-Library evaluieren:
  - [ ] [gsplat.js](https://github.com/huggingface/gsplat.js) testen
  - [ ] [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) testen
  - [ ] Entscheidung dokumentieren
- [ ] `SplatViewerLayout/` erstellen (neben `MatterportLayout/`)
- [ ] `SplatViewerContext.tsx` mit Basis-API:
  - [ ] `loadModel(url)` - .ply/.splat laden
  - [ ] `isLoading` / `error` States
  - [ ] OrbitControls für Navigation
- [ ] Feature-Flag in `App.tsx`: Matterport vs. SplatViewer je nach Floor
- [ ] Upload-UI im Frontend:
  - [ ] Video-Upload Modal
  - [ ] Job-Status-Anzeige mit Pipeline-Schritten
  - [ ] Download-Links für fertige Modelle
- [ ] RTK Query API-Slice für Reconstruction Jobs

**Geschätzte Dauer:** 2 Wochen

---

## Phase 4: Tag-System + Matterport-Ablösung

**Ziel:** Locations/Mattertags im eigenen Viewer erstellen/bearbeiten.

### Tasks
- [ ] Raycasting für Click-to-Place implementieren
- [ ] Location-Marker als 3D-Overlays im Viewer
- [ ] `SplatViewerContext` erweitern:
  - [ ] `createTag(x, y, z, label, color)`
  - [ ] `editTag(id, data)`
  - [ ] `deleteTag(id)`
  - [ ] `selectedTag` State
  - [ ] `pose` (Kameraposition)
- [ ] Backend: Matterport GraphQL API Calls entfernen
- [ ] Frontend: `MatterportContext` durch `SplatViewerContext` ersetzen
- [ ] Matterport SDK Dependency entfernen
- [ ] Matterport Environment Variables entfernen
- [ ] Testen: Alle bestehenden Features (Tasks, Documents, Notifications) mit neuem Viewer

**Geschätzte Dauer:** 2 Wochen

---

## Phase 5: Robustheit + Optimierung

**Ziel:** Produktionsreif machen.

### Tasks
- [ ] Worker: Timeout-Handling verbessern
- [ ] Worker: Retry-Logik für COLMAP-Fehler
- [ ] Worker: Qualitäts-Validierung (Min. Punktanzahl, Blur-Detection)
- [ ] Backend: Job-Retry Endpoint
- [ ] Frontend: Capture-Guide mit Tipps zur Videoaufnahme
- [ ] GCP: Monitoring + Alerting einrichten
- [ ] GCP: Preemptible VMs für niedrigere Kosten evaluieren
- [ ] Optional: GLOMAP als Alternative zu COLMAP evaluieren
- [ ] Optional: .spz Format-Export
- [ ] Optional: Supabase Realtime für Live-Status-Updates (statt Polling)

**Geschätzte Dauer:** 2 Wochen

---

## Technische Referenzen

### Kritische Dateien (Backend)
| Datei | Beschreibung |
|-------|-------------|
| `app/routes/reconstructionRoute.js` | Job-Management API |
| `app/resolvers/reconstructionResolver.js` | GCS + Cloud Batch Integration |
| `supabase/migrations/20260309000001_reconstruction_jobs.sql` | DB-Schema |
| `worker/docker/Dockerfile` | GPU Worker Container |
| `worker/pipeline/pipeline.py` | Rekonstruktions-Pipeline |
| `docs/3d-pipeline.md` | Architektur-Dokumentation |

### Kritische Dateien (Frontend - Phase 3+4)
| Datei | Beschreibung |
|-------|-------------|
| `src/contexts/MatterportContext.tsx` | Zu replizierendes Interface |
| `src/Layouts/MatterportLayout/components/Matterport.tsx` | Zu ersetzende Komponente |
| `src/store/modalSlice.ts` | Tag-Window Redux State |

### GCP-Ressourcen
| Service | Ressource | Kosten |
|---------|-----------|--------|
| Cloud Storage | Bucket `cosmic-3d-pipeline` | ~$0.02/GB/Monat |
| Cloud Batch | n1-standard-8 + T4 GPU | ~$0.35/Std |
| Artifact Registry | Docker Images | ~$0.10/GB/Monat |
