# Architektur-Übersicht – Backend

## Technologie-Stack

| Kategorie | Technologie |
|-----------|------------|
| Runtime | Node.js |
| Framework | Express.js |
| Datenbank | Supabase (PostgreSQL) |
| Authentifizierung | JWT (Access + Refresh Tokens) |
| API-Dokumentation | Swagger / OpenAPI |
| Build | esbuild (build.js) |
| 3D-Integration | Matterport API |

---

## Domain-Modell

Das Backend ist um den **Space** als primäres Aggregat organisiert:

```
Space (primäres Aggregat)
├── Tasks (Aufgaben)
├── Documents (Dokumente)
├── Notifications (Benachrichtigungen)
├── Mattertags (Matterport-Verknüpfungen)
└── Users / Permissions (Benutzer & Rechte)
```

Weitere Details: [Domain Model Dokumentation](../docs/domain-model.md)

---

## Projektstruktur

```
app/
├── routes/           # API-Routen (Express Router)
│   ├── spaces/       # Space-Endpunkte
│   ├── tasks/        # Task-Endpunkte
│   ├── documents/    # Dokument-Endpunkte
│   └── notifications/ # Benachrichtigungs-Endpunkte
│
├── middleware/        # Express-Middleware
│   ├── auth.js       # JWT-Verifikation
│   └── validation.js # Request-Validierung
│
├── services/          # Business-Logik
│
└── utils/             # Hilfsfunktionen

supabase/              # Datenbankmigrationen und Typen
docs/                  # Technische Dokumentation (Diagramme)
server.js              # Entry Point
swagger.json           # OpenAPI-Spezifikation
```

---

## API-Sicherheit

- **Basic Auth**: API_LOGIN + API_PASS für allgemeinen Zugriff
- **JWT Access Token**: Kurzlebig (15min) für API-Calls
- **JWT Refresh Token**: Langlebig für Token-Erneuerung
- **Cookie Security**: HttpOnly-Cookies

---

## Datenfluss

```
Client-Request
    │
    ▼
Express Router
    │
    ▼
Auth-Middleware (JWT prüfen)
    │
    ▼
Route-Handler
    │
    ├──► Supabase (Datenbankoperationen)
    │
    └──► Matterport API (optional)
```
