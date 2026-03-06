# Domain Model (Current Backend)

## 1. Purpose and Scope

This document describes the **business domain model of the current backend** based on the live initial migration. It is intended as a shared reference for product, business stakeholders, and engineering.

**Scope of this document:**
- Focus on business entities and their relationships in the current state.
- Source of truth is `supabase/migrations/20251204122046_initial_schema.sql`.
- Only tables currently present in the schema are covered.

Out of scope are API implementation details, UI flows, and future architecture decisions beyond the current schema.

## 2. Entities in the Current Schema

### 2.1 `spaces`
**Business meaning:**
- A *Space* is the central business context (e.g., property/area) in which rooms, locations, and related tasks are organized.

**Key attributes:**
- `space_id` (primary key)
- `name` (business label)

**Relationships and cardinalities:**
- 1:n to `rooms` via `rooms.space_id` (one space can have multiple rooms).
- 1:n to `locations` via `locations.space_id` (one space can have multiple locations).
- m:n to `rooms` via `space_rooms` (explicit assignment table).
- m:n to `locations` via `space_locations` (explicit assignment table).

### 2.2 `floors`
**Business meaning:**
- A *Floor* represents a level/story in the spatial structure.

**Key attributes:**
- `floor_id` (primary key)
- `name`
- `matterport_floor_id` (external reference)
- `sequence` (ordering)

**Relationships and cardinalities:**
- 1:n to `rooms` via `rooms.floor_id`.
- 1:n to `locations` via `locations.floor_id`.
- 1:n to `notifications` via `notifications.floor_id`.

### 2.3 `rooms`
**Business meaning:**
- A *Room* is a concrete room within the spatial structure.

**Key attributes:**
- `room_id` (primary key)
- `name`
- `floor_id` (reference to floor)
- `space_id` (reference to space)

**Relationships and cardinalities:**
- n:1 to `floors`.
- n:1 to `spaces`.
- 1:n to `locations` (a location may optionally be assigned to a room).
- 1:n to `documents`.
- 1:n to `notifications`.
- m:n to `spaces` via `space_rooms`.

### 2.4 `locations`
**Business meaning:**
- A *Location* represents a precise point of interest (e.g., tag/pin in a model).

**Key attributes:**
- `location_id` (primary key)
- `location_name`, `description`, `color`
- `x`, `y`, `z` (coordinates)
- `enabled` (active flag)
- `floor_id`, `room_id`, `space_id` (spatial/business assignment)
- `matterport_tag_id` (external reference)

**Relationships and cardinalities:**
- n:1 to `floors`, `rooms`, `spaces` (all optional).
- 1:n to `tasks`.
- 1:n to `documents`.
- 1:n to `notifications`.
- m:n to `spaces` via `space_locations`.

### 2.5 `tasks`
**Business meaning:**
- A *Task* is an operational work item in the system.

**Key attributes:**
- `task_id` (primary key)
- `description`
- `status` (default: `pending`)
- `created_at`
- `user_id` (assigned/responsible person)
- `activity_id` (activity type)
- `location_id` (spatial reference)
- `reccuring_id` (recurrence rule)

**Relationships and cardinalities:**
- n:1 to `users`.
- n:1 to `activity`.
- n:1 to `locations`.
- n:1 to `reccuring`.
- 1:n to `documents`.
- 1:n to `notifications`.
- m:n to `lists` via `list_tasks`.

### 2.6 `documents`
**Business meaning:**
- A *Document* is a file/evidence object attached to tasks or spatial objects.

**Key attributes:**
- `document_id` (primary key)
- `file_url`
- `created_at`
- `user_id`, `task_id`, `room_id`, `location_id` (optional assignments)

**Relationships and cardinalities:**
- n:1 to `users`, `tasks`, `rooms`, `locations`.
- 1:n to `notifications`.

### 2.7 `lists`
**Business meaning:**
- A *List* groups tasks into business bundles/checklists.

**Key attributes:**
- `list_id` (primary key)
- `name`

**Relationships and cardinalities:**
- m:n to `tasks` via `list_tasks`.

### 2.8 `users`
**Business meaning:**
- A *User* represents a person in the system (including auth synchronization).

**Key attributes:**
- `user_id` (primary key)
- `username`, `first_name`, `last_name`, `email`
- `clerk_id` (auth provider reference)
- `role`
- `access_token`, `refresh_token`
- `created_at`

**Relationships and cardinalities:**
- 1:n to `tasks`.
- 1:n to `documents`.
- 1:n to `menu_items`.

### 2.9 `notifications`
**Business meaning:**
- A *Notification* is a signal/event hint for new or relevant changes.

**Key attributes:**
- `notification_id` (primary key)
- `is_new`
- `created_at`
- `floor_id`, `room_id`, `task_id`, `location_id`, `document_id` (business references)

**Relationships and cardinalities:**
- n:1 to `floors`, `rooms`, `tasks`, `locations`, `documents`.

### 2.10 `menu_items`
**Business meaning:**
- *Menu items* are user-specific navigation/configuration entries.

**Key attributes:**
- `menu_items_id` (primary key)
- `name`
- `order`
- `enabled`
- `user_id`

**Relationships and cardinalities:**
- n:1 to `users`.

### 2.11 Lookup Tables

#### `activity`
**Business meaning:**
- Catalog of activity types used by tasks.

**Key attributes:**
- `activity_id` (primary key)
- `name`

**Relationships:**
- 1:n to `tasks`.

#### `reccuring`
**Business meaning:**
- Catalog of recurrence intervals/types used by tasks.

**Key attributes:**
- `reccuring_id` (primary key)
- `name`

**Relationships:**
- 1:n to `tasks`.

### 2.12 Join Tables

#### `space_rooms`
**Business meaning:**
- Links spaces and rooms for explicit m:n assignments.

**Key attributes:**
- `space_id`
- `room_id`
- `unique(space_id, room_id)`

**Relationships:**
- n:1 to `spaces`.
- n:1 to `rooms`.

#### `space_locations`
**Business meaning:**
- Links spaces and locations for explicit m:n assignments.

**Key attributes:**
- `space_id`
- `location_id`
- `unique(space_id, location_id)`

**Relationships:**
- n:1 to `spaces`.
- n:1 to `locations`.

#### `list_tasks`
**Business meaning:**
- Links lists and tasks.

**Key attributes:**
- `list_id`
- `task_id`
- `unique(list_id, task_id)`

**Relationships:**
- n:1 to `lists`.
- n:1 to `tasks`.

## 3. Current State vs. Target State

The current schema already covers core objects for spatial structure, tasks, documents, and notifications. However, explicit tables/objects for the following target-state concepts are still missing:

- `assets` *(missing in current schema)*
- `events` *(missing in current schema)*
- `space_membership` *(missing in current schema)*

These gaps are important for future modeling of inventory/assets, time-based events, and per-space membership/role logic.

## 4. Modeling Rules

1. **Space as root concept:**
   - From a business perspective, `spaces` is the primary container for spatial and operational objects.

2. **Flexible placement via Floor/Room/Location:**
   - Objects can be anchored at different granularities (floor, room, point location).
   - `locations` provides the most fine-grained spatial reference (including coordinates).

3. **Separation of tasks and notifications:**
   - `tasks` model operational work items (status, responsibility, due handling via process logic).
   - `notifications` model signals/events and reference tasks or spatial context, but are not tasks themselves.

## 5. Compact Relationship Overview

- `spaces` 1:n `rooms`; additionally m:n via `space_rooms`.
- `spaces` 1:n `locations`; additionally m:n via `space_locations`.
- `floors` 1:n `rooms`, `locations`, `notifications`.
- `rooms` 1:n `locations`, `documents`, `notifications`.
- `locations` 1:n `tasks`, `documents`, `notifications`.
- `users` 1:n `tasks`, `documents`, `menu_items`.
- `tasks` n:1 `users`, `activity`, `locations`, `reccuring`; 1:n `documents`, `notifications`; m:n `lists` via `list_tasks`.
- `documents` n:1 `users`, `tasks`, `rooms`, `locations`; 1:n `notifications`.
- `lists` m:n `tasks` via `list_tasks`.
- `notifications` n:1 `floors`, `rooms`, `tasks`, `locations`, `documents`.
- `menu_items` n:1 `users`.
