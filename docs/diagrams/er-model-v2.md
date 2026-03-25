# ER Model v2

This diagram extends the v1 schema with the tables and columns added by the v2 migration (`20260306000001_v2_additive_schema.sql`). Only the additions and changed tables are shown; unchanged v1 tables are omitted for clarity.

```mermaid
erDiagram
    SPACES {
        bigint space_id PK
        text name
        bigint owner_user_id FK
        text description
        timestamptz updated_at
    }

    FLOORS {
        bigint floor_id PK
        text name
        bigint space_id FK
        integer level_index
        timestamptz updated_at
    }

    ROOMS {
        bigint room_id PK
        text name
        bigint floor_id FK
        bigint space_id FK
        text room_type
        timestamptz updated_at
    }

    LOCATIONS {
        bigint location_id PK
        text location_name
        bigint floor_id FK
        bigint room_id FK
        bigint space_id FK
        timestamptz updated_at
    }

    ASSETS {
        bigint asset_id PK
        bigint space_id FK
        bigint floor_id FK
        bigint room_id FK
        bigint location_id FK
        text name
        text asset_type
        text manufacturer
        text model
        text serial_number
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    EVENTS {
        bigint event_id PK
        bigint space_id FK
        bigint floor_id FK
        bigint room_id FK
        bigint location_id FK
        bigint asset_id FK
        bigint created_by_user_id FK
        text title
        text description
        timestamptz starts_at
        timestamptz ends_at
        text external_participants
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    EVENT_TASKS {
        bigint id PK
        bigint event_id FK
        bigint task_id FK
        timestamptz created_at
    }

    SPACE_MEMBERSHIPS {
        bigint id PK
        bigint space_id FK
        bigint user_id FK
        text role
        timestamptz created_at
    }

    TASKS {
        bigint task_id PK
        bigint user_id FK
        bigint activity_id FK
        bigint location_id FK
        bigint reccuring_id FK
        bigint space_id FK
        bigint floor_id FK
        bigint room_id FK
        bigint asset_id FK
        bigint created_by_user_id FK
        bigint assigned_user_id FK
        text title
        text status
        text task_type
        text recurrence_rule
        timestamptz due_at
        timestamptz completed_at
        timestamptz updated_at
    }

    DOCUMENTS {
        bigint document_id PK
        bigint user_id FK
        bigint task_id FK
        bigint room_id FK
        bigint location_id FK
        bigint space_id FK
        bigint floor_id FK
        bigint asset_id FK
        bigint uploaded_by_user_id FK
        text title
        text document_kind
        text mime_type
        text storage_path
        text markdown_content
        timestamptz updated_at
    }

    NOTIFICATIONS {
        bigint notification_id PK
        bigint task_id FK
        bigint floor_id FK
        bigint room_id FK
        bigint location_id FK
        bigint document_id FK
        bigint user_id FK
        bigint event_id FK
        text title
        timestamptz read_at
    }

    SPACES ||--o{ ASSETS : "space_id"
    FLOORS ||--o{ ASSETS : "floor_id (optional)"
    ROOMS ||--o{ ASSETS : "room_id (optional)"
    LOCATIONS ||--o{ ASSETS : "location_id (optional)"

    SPACES ||--o{ EVENTS : "space_id"
    FLOORS ||--o{ EVENTS : "floor_id (optional)"
    ROOMS ||--o{ EVENTS : "room_id (optional)"
    LOCATIONS ||--o{ EVENTS : "location_id (optional)"
    ASSETS ||--o{ EVENTS : "asset_id (optional)"

    EVENTS ||--o{ EVENT_TASKS : "event_id"
    TASKS ||--o{ EVENT_TASKS : "task_id"

    SPACES ||--o{ SPACE_MEMBERSHIPS : "space_id"
    USERS ||--o{ SPACE_MEMBERSHIPS : "user_id"

    SPACES ||--o{ FLOORS : "space_id (optional)"
    SPACES ||--o{ ROOMS : "space_id (optional)"
    SPACES ||--o{ LOCATIONS : "space_id (optional)"
    SPACES ||--o{ TASKS : "space_id (optional)"
    SPACES ||--o{ DOCUMENTS : "space_id (optional)"

    ASSETS ||--o{ TASKS : "asset_id (optional)"
    ASSETS ||--o{ DOCUMENTS : "asset_id (optional)"

    EVENTS ||--o{ NOTIFICATIONS : "event_id (optional)"
    USERS ||--o{ NOTIFICATIONS : "user_id (optional)"
```

## Legend

- **New tables in v2:** `assets`, `events`, `event_tasks`, `space_memberships`
- **Extended tables:** `spaces`, `floors`, `rooms`, `locations`, `tasks`, `documents`, `notifications`
- All new FK columns are optional (NULL allowed) unless marked otherwise.
- `event_tasks` and `space_memberships` enforce uniqueness via `UNIQUE(event_id, task_id)` and `UNIQUE(space_id, user_id)` respectively.
