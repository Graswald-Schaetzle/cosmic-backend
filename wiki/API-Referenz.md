# API-Referenz – Backend

> **Vollständige Dokumentation:** [Swagger UI](http://localhost:4000/api-docs/) (lokal) bzw. Produktionsumgebung

## Basis-URL

```
http://localhost:4000/api/
```

## Authentifizierung

Alle geschützten Endpunkte erfordern:
- **Basic Auth**: `API_LOGIN:API_PASS` (Header: `Authorization: Basic ...`)
- **JWT Bearer Token**: `Authorization: Bearer <access_token>`

---

## Endpunkt-Übersicht

### Authentifizierung

| Method | Endpoint | Beschreibung |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login, gibt Access + Refresh Token zurück |
| POST | `/api/auth/refresh` | Access Token erneuern |
| POST | `/api/auth/logout` | Logout, invalidiert Tokens |

### Spaces

| Method | Endpoint | Beschreibung |
|--------|----------|-------------|
| GET | `/api/spaces` | Alle Spaces abrufen |
| GET | `/api/spaces/:id` | Einzelnen Space abrufen |
| POST | `/api/spaces` | Neuen Space erstellen |
| PUT | `/api/spaces/:id` | Space aktualisieren |
| DELETE | `/api/spaces/:id` | Space löschen |

### Tasks

| Method | Endpoint | Beschreibung |
|--------|----------|-------------|
| GET | `/api/spaces/:id/tasks` | Alle Tasks eines Spaces |
| POST | `/api/spaces/:id/tasks` | Neuen Task erstellen |
| PUT | `/api/tasks/:id` | Task aktualisieren |
| DELETE | `/api/tasks/:id` | Task löschen |

### Dokumente

| Method | Endpoint | Beschreibung |
|--------|----------|-------------|
| GET | `/api/spaces/:id/documents` | Dokumente eines Spaces |
| POST | `/api/spaces/:id/documents` | Dokument hochladen |
| DELETE | `/api/documents/:id` | Dokument löschen |

### Benachrichtigungen

| Method | Endpoint | Beschreibung |
|--------|----------|-------------|
| GET | `/api/spaces/:id/notifications` | Benachrichtigungen abrufen |
| PUT | `/api/notifications/:id/read` | Als gelesen markieren |

---

## Fehler-Codes

| Code | Bedeutung |
|------|-----------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (Validierungsfehler) |
| 401 | Unauthorized (kein/ungültiger Token) |
| 403 | Forbidden (keine Berechtigung) |
| 404 | Not Found |
| 500 | Internal Server Error |
