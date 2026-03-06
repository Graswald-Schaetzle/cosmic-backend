# ER Model v1

```mermaid
erDiagram
    SPACES {
        bigint space_id PK
        text name
    }

    SPACE_ROOMS {
        bigint space_id FK
        bigint room_id FK
    }

    ROOMS {
        bigint room_id PK
        text name
        bigint floor_id FK
        bigint space_id FK
    }

    SPACE_LOCATIONS {
        bigint space_id FK
        bigint location_id FK
    }

    LOCATIONS {
        bigint location_id PK
        text location_name
        bigint floor_id FK
        bigint room_id FK
        bigint space_id FK
    }

    FLOORS {
        bigint floor_id PK
        text name
    }

    TASKS {
        bigint task_id PK
        bigint user_id FK
        bigint activity_id FK
        bigint location_id FK
        bigint reccuring_id FK
        text status
    }

    DOCUMENTS {
        bigint document_id PK
        bigint user_id FK
        bigint task_id FK
        bigint room_id FK
        bigint location_id FK
    }

    LISTS {
        bigint list_id PK
        text name
    }

    LIST_TASKS {
        bigint list_id FK
        bigint task_id FK
    }

    USERS {
        bigint user_id PK
        text username
    }

    NOTIFICATIONS {
        bigint notification_id PK
        bigint task_id FK
        bigint floor_id FK
        bigint room_id FK
        bigint location_id FK
        bigint document_id FK
    }

    ACTIVITY {
        bigint activity_id PK
        text name
    }

    RECCURING {
        bigint reccuring_id PK
        text name
    }

    SPACES ||--o{ SPACE_ROOMS : "space_id"
    ROOMS ||--o{ SPACE_ROOMS : "room_id"

    SPACES ||--o{ SPACE_LOCATIONS : "space_id"
    LOCATIONS ||--o{ SPACE_LOCATIONS : "location_id"

    FLOORS ||--o{ ROOMS : "floor_id (optional in rooms)"
    ROOMS ||--o{ LOCATIONS : "room_id (optional in locations)"

    TASKS ||--o{ DOCUMENTS : "task_id (optional in documents)"

    LISTS ||--o{ LIST_TASKS : "list_id"
    TASKS ||--o{ LIST_TASKS : "task_id"

    USERS ||--o{ TASKS : "user_id (optional in tasks)"
    USERS ||--o{ DOCUMENTS : "user_id (optional in documents)"

    TASKS ||--o{ NOTIFICATIONS : "task_id (optional)"
    FLOORS ||--o{ NOTIFICATIONS : "floor_id (optional)"
    ROOMS ||--o{ NOTIFICATIONS : "room_id (optional)"
    LOCATIONS ||--o{ NOTIFICATIONS : "location_id (optional)"
    DOCUMENTS ||--o{ NOTIFICATIONS : "document_id (optional)"

    ACTIVITY ||--o{ TASKS : "activity_id (optional)"
    RECCURING ||--o{ TASKS : "reccuring_id (optional)"
```

## Legend

- **Required FK (NOT NULL):** The foreign key column in the child table is mandatory. In this schema, this applies to the join tables `space_rooms`, `space_locations`, and `list_tasks`.
- **Optional FK (NULL allowed):** The foreign key column in the child table is optional. In this schema, this applies to columns such as `rooms.floor_id`, `locations.room_id`, `tasks.user_id`, `documents.task_id`, and all FK columns in `notifications`.
