# Projektmanagement – Backend

## GitHub Project Board

Das Projekt-Board für das Backend findest du unter:
**[Cosmic Backend – API Roadmap](https://github.com/Graswald-Schaetzle/cosmic-backend/projects)**

---

## Board-Struktur

Das Board ist als **Kanban-Board** organisiert:

| Spalte | Bedeutung |
|--------|-----------|
| **Backlog** | Gesammelte Aufgaben, noch nicht priorisiert |
| **Bereit** | Priorisierte Aufgaben für den nächsten Sprint |
| **In Bearbeitung** | Aktiv in Entwicklung (max. 2-3 Items) |
| **Review / QA** | PR erstellt, wartet auf Review |
| **Erledigt** | Abgeschlossen und gemergt |

---

## Themen-Steuerung

Issues werden über **Labels** nach API-Bereichen organisiert:

### Backend-Themen

| Label | Beschreibung |
|-------|-------------|
| `thema: spaces` | Spaces API – Haupt-Aggregat |
| `thema: tasks-api` | Tasks und Aufgaben-Endpunkte |
| `thema: dokumente-api` | Dokumentenverwaltung |
| `thema: benachrichtigungen-api` | Notification-Endpunkte |
| `thema: auth` | JWT-Authentifizierung |
| `thema: matterport` | Matterport-Integration |
| `thema: datenbank` | Supabase / Schema / Migrationen |
| `thema: api-docs` | Swagger/OpenAPI |
| `thema: security` | Sicherheit |
| `thema: performance` | Performance und Caching |
| `thema: devops` | CI/CD und Deployment |

### Status-Labels

| Label | Bedeutung |
|-------|-----------|
| `status: backlog` | Noch nicht priorisiert |
| `status: bereit` | Bereit zur Bearbeitung |
| `status: in-bearbeitung` | Aktiv in Arbeit |
| `status: review` | Wartet auf Review |
| `status: blockiert` | Blockiert durch externe Abhängigkeit |

---

## Issue-Workflow

1. **Issue erstellen** → Vorlage auswählen (Bug / Feature / Task)
2. **API-Bereich zuweisen** → Themen-Label setzen
3. **Endpoint dokumentieren** → Im Issue beschreiben
4. **Priorisierung** → `status: bereit` im Weekly-Meeting
5. **Entwicklung** → `status: in-bearbeitung` setzen
6. **Swagger aktualisieren** → swagger.json pflegen
7. **PR erstellen** → Review anfordern
8. **Merge & Close**

---

## Branch-Konvention

```
feature/   → Neue API-Endpunkte
fix/       → Bugfixes
refactor/  → Refactoring
docs/      → Dokumentation (Swagger etc.)
chore/     → Build/Config
db/        → Datenbankänderungen
```

**Beispiele:**
- `feature/spaces-permissions-endpoint`
- `fix/jwt-refresh-token-expiry`
- `db/add-notifications-table`

---

## Commit-Convention

```
feat(api): kurze Beschreibung
fix(auth): was wurde behoben
refactor(spaces): was wurde umgebaut
docs(swagger): API-Dokumentation
db(migration): Schema-Änderung
```
