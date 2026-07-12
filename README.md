# Lexora — ERP Full-Stack Application

> **Holberton School Portfolio Project** — A full-stack Enterprise Resource Planning (ERP) web application for small teams: task management, CRM, invoicing, calendar, document vault, and AI assistant.

[![Node.js](https://img.shields.io/badge/Node.js-18-green?logo=nodedotjs)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev)
[![SQLite](https://img.shields.io/badge/SQLite-3-lightblue?logo=sqlite)](https://www.sqlite.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://docs.docker.com/compose)
[![License](https://img.shields.io/badge/License-Educational-orange)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Application Architecture](#application-architecture)
- [Database Diagram](#database-diagram)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
  - [Docker (Recommended)](#docker-recommended)
  - [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Security](#security)
- [Team](#team)

---

## Overview

**Lexora** is a centralized workspace for small business operations. It replaces scattered tools with a single, integrated application:

- A unified **dashboard** with live KPIs (task count, invoice totals, pending items)
- **Task management** for project tracking and quick notes
- **CRM + Invoicing** for client and billing management
- **Interactive calendar** integrating events and staff schedules
- **Document vault** with folder hierarchy and drag-and-drop uploads
- **AI assistant** powered by a local LLM via Ollama
- **Admin panel** for employee directory, schedules, and automation rules

---

## Features

| Module | Description |
|--------|-------------|
| 📊 **Dashboard** | Animated KPI cards — task counts, invoice totals, pending items |
| ✅ **Tasks** | Department-level tasks on a kanban board (drag & drop, priority, due date) — visible to every member of the department |
| 📌 **Todos (sticky notes)** | Personal mini-tasks assigned to one or more employees, rendered as colored post-its on the employee dashboard |
| 💶 **Clients & Invoices** | Contact management + invoices with status tracking (pending / paid / cancelled) |
| 📅 **Calendar** | Month/week/day views, click-to-create events, staff schedule integration |
| 📁 **Document Vault** | Hierarchical folder tree, drag-and-drop upload, file download, 50 MB limit |
| 🤖 **AI Assistant** | Real-time chat with a local LLM (Ollama / llama3.2) |
| 👥 **Team (Admin)** | Employee directory, shift planning, automation rule management |

---

## Application Architecture

### High-Level Overview

```mermaid
graph TB
    subgraph Client["Browser (Client)"]
        React["React 18 SPA\n(Vite build)"]
    end

    subgraph Docker["Docker Compose"]
        subgraph FrontendContainer["Frontend Container"]
            Nginx["Nginx\n:80"]
        end

        subgraph BackendContainer["Backend Container"]
            Express["Express REST API\n:3000"]
            Routes["Route Modules\n(11 domains)"]
            Middleware["Middleware\nHelmet · CORS · JWT · Rate-limit"]
        end

        subgraph Data["Persistent Volumes"]
            SQLite["SQLite\nlexora.db"]
            Uploads["File Storage\n/uploads/"]
        end
    end

    subgraph External["External (Host)"]
        Ollama["Ollama LLM\n:11434\n(optional)"]
    end

    React -- "HTTP :80" --> Nginx
    Nginx -- "Static files\nindex.html + assets" --> React
    Nginx -- "Proxy /api/*\n(HTTP internal)" --> Express
    Express --> Middleware
    Middleware --> Routes
    Routes -- "better-sqlite3\n(synchronous)" --> SQLite
    Routes -- "multer\nuploads" --> Uploads
    Routes -- "HTTP POST\n/api/chat" --> Ollama
```

### Request Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Nginx
    participant E as Express API
    participant D as SQLite DB

    B->>N: GET /
    N-->>B: index.html + React bundle

    B->>N: POST /api/auth/login
    N->>E: proxy → :3000
    E->>D: SELECT employe WHERE email=?
    D-->>E: row (with password_hash)
    E-->>N: { token, user }
    N-->>B: JWT token

    B->>N: GET /api/taches (Bearer token)
    N->>E: proxy → :3000
    E->>E: verifyJWT middleware
    E->>D: SELECT * FROM taches
    D-->>E: rows[]
    E-->>B: JSON array
```

### Frontend Architecture

```mermaid
graph TD
    main["main.jsx\nReactDOM.createRoot"] --> App

    App --> AuthProvider["AuthProvider\n(JWT context)"]
    App --> ToastProvider["ToastProvider\n(notifications)"]
    App --> Router["React Router v6"]

    Router --> Login["Login\n/login"]
    Router --> AppLayout["AppLayout\n(sidebar + main)"]

    AppLayout --> Sidebar["Sidebar\n(navigation)"]
    AppLayout --> Pages

    Pages --> Dashboard["/"]
    Pages --> Taches["/taches"]
    Pages --> ClientsFactures["/business"]
    Pages --> Calendrier["/calendrier"]
    Pages --> CoffreFort["/documents"]
    Pages --> Assistant["/assistant"]
    Pages --> Equipe["/equipe\n(admin only)"]
    Pages --> MonEspace["/mon-espace\n(auth required)"]
```

---

## Database Diagram

```mermaid
erDiagram
    departements {
        INTEGER id PK
        TEXT nom UK
        TEXT created_at
    }

    employes {
        INTEGER id PK
        TEXT nom
        TEXT prenom
        TEXT email
        TEXT poste
        INTEGER departement_id FK
        REAL salaire
        TEXT date_embauche
        TEXT role
        TEXT password_hash
        TEXT created_at
    }

    tasks {
        INTEGER id PK
        TEXT title
        TEXT description
        INTEGER department_id FK
        INTEGER created_by FK
        TEXT status
        TEXT priority
        TEXT due_date
        TEXT created_at
        TEXT updated_at
    }

    todos {
        INTEGER id PK
        TEXT content
        TEXT color
        INTEGER created_by FK
        TEXT status
        TEXT done_at
        TEXT created_at
        TEXT updated_at
    }

    todo_assignees {
        INTEGER todo_id PK, FK
        INTEGER assignee_id PK, FK
    }

    clients {
        INTEGER id PK
        TEXT type_client
        TEXT email
        TEXT telephone
        TEXT adresse
        TEXT nom
        TEXT prenom
        TEXT raison_sociale
        TEXT siret
        TEXT tva
        TEXT contact_nom
        TEXT created_at
    }

    factures {
        INTEGER id PK
        TEXT client
        REAL montant
        TEXT statut
        TEXT date_emission
        TEXT date_echeance
    }

    evenements {
        INTEGER id PK
        TEXT titre
        TEXT description
        TEXT date_debut
        TEXT date_fin
        TEXT type
        TEXT couleur
        TEXT created_by
        TEXT created_at
    }

    planning {
        INTEGER id PK
        INTEGER employe_id FK
        TEXT date
        TEXT heure_debut
        TEXT heure_fin
        TEXT projet
    }

    automations {
        INTEGER id PK
        TEXT nom
        TEXT description
        TEXT type
        TEXT frequence
        TEXT action
        INTEGER actif
        TEXT created_at
    }

    dossiers {
        INTEGER id PK
        TEXT nom
        TEXT description
        INTEGER parent_id FK
        TEXT created_at
    }

    documents {
        INTEGER id PK
        TEXT nom
        TEXT nom_fichier
        TEXT type
        TEXT taille
        TEXT statut
        TEXT description
        INTEGER dossier_id FK
        TEXT created_at
    }

    departements ||--o{ employes : "departement_id (ON DELETE SET NULL)"
    departements ||--o{ tasks : "department_id (ON DELETE CASCADE)"
    employes ||--o{ tasks : "created_by (ON DELETE SET NULL)"
    employes ||--o{ todos : "created_by (ON DELETE SET NULL)"
    todos ||--o{ todo_assignees : "todo_id (ON DELETE CASCADE)"
    employes ||--o{ todo_assignees : "assignee_id (ON DELETE CASCADE)"
    employes ||--o{ planning : "employe_id (ON DELETE CASCADE)"
    dossiers ||--o{ dossiers : "parent_id (self-reference)"
    dossiers ||--o{ documents : "dossier_id"
```

### Referential Integrity Audit

Foreign keys are enforced at runtime (`PRAGMA foreign_keys = ON` on every connection).
Plain-text reference fields were audited and migrated to real foreign keys with
idempotent, data-preserving migrations (see `backend/models/db.js`):

| Field | Decision | Rationale |
|-------|----------|-----------|
| `employes.departement` (TEXT) | ✅ Migrated → `departement_id` FK, **ON DELETE SET NULL** | Deleting a department must not delete its employees. Departments are created from the existing distinct values, so no data is lost. |
| `taches.assignee` (TEXT) | ✅ Replaced by the `tasks` model | Tasks are now department-scoped (individual assignment is the todos' job). Legacy rows are moved into `tasks` under a "Général" department; the old free-text assignee is preserved as an annotation in the description. |
| `planning.employe` (TEXT) | ✅ Migrated → `employe_id` FK, **ON DELETE CASCADE** | A schedule slot is meaningless without its employee, and GDPR-wise deleting an employee must purge their schedule. Backfilled by case-insensitive name matching; the text column is only dropped once every row is matched (retried on next boot otherwise). |
| `tasks.department_id` | **ON DELETE CASCADE**, NOT NULL | A department task only exists through its department. |
| `tasks.created_by` / `todos.created_by` | **ON DELETE SET NULL** | The work survives its creator's departure, but the personal reference disappears (GDPR). |
| `todo_assignees.*` | **ON DELETE CASCADE** (both FKs) | Pure join table — rows follow the todo and the employee. |
| `factures.client` (TEXT) | ⏸ Kept as text **on purpose** | An invoice is a legal snapshot: the client label at issuance time must stay frozen even if the client record later changes or is deleted. |
| `evenements.created_by` (TEXT) | ⏸ Kept as text (future candidate) | Purely informative field; name-based backfill would be too unreliable to migrate without corruption risk. |

### Table Reference

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `departements` | Company departments referential | `nom` (unique) |
| `employes` | Employee directory + auth accounts | `email`, `role` (employe/manager/admin), `departement_id`, `password_hash` |
| `tasks` | Department tasks (kanban) | `title`, `department_id`, `status` (todo/in_progress/done), `priority` (low/medium/high), `due_date` |
| `todos` | Personal sticky notes | `content`, `color`, `created_by`, `status` (pending/done), `done_at` |
| `todo_assignees` | Todo ↔ employee join table | `todo_id`, `assignee_id` |
| `clients` | Client contacts (individuals + companies) | `type_client`, `email`, `nom`/`raison_sociale` |
| `factures` | Invoices | `client`, `montant`, `statut` (en attente/payee/annulee) |
| `evenements` | Calendar events | `titre`, `date_debut`, `date_fin`, `type`, `couleur` |
| `planning` | Employee work schedules | `employe_id`, `date`, `heure_debut`, `heure_fin` |
| `automations` | Automation rules (admin) | `nom`, `action`, `actif` |
| `dossiers` | Document vault folders (tree via `parent_id`) | `nom`, `parent_id` |
| `documents` | Uploaded file metadata | `nom`, `nom_fichier`, `type`, `taille`, `dossier_id` |

---

## Tech Stack

### Backend

| Technology | Version | Role |
|-----------|---------|------|
| **Node.js** | 18 | JavaScript runtime |
| **Express** | 4 | HTTP server, REST API |
| **better-sqlite3** | 9+ | Synchronous SQLite driver |
| **jsonwebtoken** | 9 | JWT authentication |
| **bcryptjs** | 3 | Password hashing |
| **Multer** | 2 | Multipart file uploads |
| **Helmet** | 8 | HTTP security headers |
| **express-rate-limit** | 8 | Request rate limiting |
| **dotenv** | 16 | Environment configuration |

### Frontend

| Technology | Version | Role |
|-----------|---------|------|
| **React** | 18 | UI framework (SPA) |
| **Vite** | 5 | Build tool + dev server |
| **React Router** | 6 | Client-side routing |
| **react-big-calendar** | 1 | Interactive calendar component |
| **date-fns** | 4 | Date manipulation + fr locale |
| **CSS (vanilla)** | — | Custom design system (1,300+ lines) |

### Infrastructure

| Technology | Role |
|-----------|------|
| **Docker** + **Docker Compose** | Containerization (2 containers) |
| **Nginx (Alpine)** | Reverse proxy + static file server |
| **Docker volumes** | SQLite persistence + file uploads |
| **Ollama** (optional) | Local LLM for AI assistant |

---

## Quick Start

### Docker (Recommended)

**Prerequisites:** Docker and Docker Compose installed.

```bash
# 1. Clone the repository
git clone https://github.com/poloelo/Holberton-portfolio-projet.git
cd Holberton-portfolio-projet

# 2. Configure environment
#    lexora/.env is already pre-configured for Docker
#    Edit lexora/.env to set your own JWT_SECRET before production use

# 3. Start the application
docker compose up --build

# Application is available at http://localhost
```

**Default admin account:**
```
Email:    admin@lexora.fr
Password: Admin1234!
```

> **AI Assistant:** To enable the AI assistant, install [Ollama](https://ollama.ai) on your host:
> ```bash
> ollama pull llama3.2
> ollama serve
> ```

To stop:
```bash
docker compose down

# Remove volumes (WARNING: deletes all data)
docker compose down -v
```

---

### Local Development

**Prerequisites:** Node.js 18+, npm.

```bash
# Clone
git clone https://github.com/poloelo/Holberton-portfolio-projet.git
cd Holberton-portfolio-projet

# Backend
cd lexora/backend
npm install
npm run seed         # optional: demo departments, employees, tasks, todos, planning
npm run dev          # starts with node --watch (auto-reload) on :3000

# Frontend (new terminal)
cd lexora/frontend
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

The Vite dev proxy (`vite.config.js`) automatically forwards `/api/*` to `http://localhost:3000`.

#### Demo accounts (`npm run seed`)

The seed script is idempotent (safe to re-run). Every demo account uses the
password `demo1234`:

| Email | Role | Department |
|-------|------|------------|
| `admin@lexora.fr` | admin | Direction |
| `m.dupont@lexora.fr` | manager | Finance |
| `s.martin@lexora.fr` | employe | Finance |
| `a.petit@lexora.fr` | manager | Technique |
| `j.bernard@lexora.fr` | employe | Technique |
| `c.moreau@lexora.fr` | employe | Ressources Humaines |
| `t.roux@lexora.fr` | employe | Commercial |

---

## Environment Variables

File location: `lexora/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Express server port |
| `DB_PATH` | `./lexora.db` | SQLite file path |
| `JWT_SECRET` | *(required)* | Secret key for signing JWT tokens |
| `ADMIN_KEY` | *(required)* | Secret key for admin API routes |
| `ALLOWED_ORIGINS` | `http://localhost` | Comma-separated CORS allowed origins |
| `ADMIN_EMAIL` | — | Seeds an admin account on first startup |
| `ADMIN_PASSWORD` | — | Password for the seeded admin account |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2` | LLM model used by the AI assistant |

> **Security:** Never commit your `.env` file. It is listed in `.gitignore`.

---

## API Reference

All endpoints are prefixed with `/api`.

### Health
```
GET  /api/health         → { status: 'ok', timestamp }
```

### Authentication
```
POST /api/auth/login     → { token, user }   Body: { email, password }
```

### Department Tasks — JWT required (`Authorization: Bearer <token>`)

Visibility: employees see their own department's tasks; admins see everything.
Roles: creation/update/deletion require `manager` (own department only) or `admin`.
Status change is open to every member of the task's department.

```
GET    /api/tasks             → Task[]   Query: ?status=&priority=&department_id= (department_id: admin only)
POST   /api/tasks             → Task     Body: { title*, department_id*, description, status, priority, due_date }
                                         (manager|admin — manager restricted to own department)
PUT    /api/tasks/:id         → Task     (manager of the department | admin)
PATCH  /api/tasks/:id/status  → Task     Body: { status: 'todo'|'in_progress'|'done' }  (any department member)
DELETE /api/tasks/:id         → { message }  (manager of the department | admin)
```

Errors: `400` invalid field / unknown `department_id`, `401` missing token, `403` insufficient role
or wrong department, `404` unknown task.

### Todos (personal sticky notes) — JWT required

Visibility: the todos you created + the todos assigned to you.
Only the creator can update/delete; creator **or** assignee can toggle done.
Assigning to other employees requires `manager` or `admin` (regular employees
create self-assigned notes).

```
GET    /api/todos             → Todo[]   (each with assignees: [{ id, nom }])
POST   /api/todos             → Todo     Body: { content* (≤280), color (#rrggbb), assignee_ids: [id] }
                                         (assignee_ids defaults to yourself)
PUT    /api/todos/:id         → Todo     Body: { content, color, assignee_ids }  (creator only)
PATCH  /api/todos/:id/toggle  → Todo     Toggles pending/done + done_at  (creator or assignee)
DELETE /api/todos/:id         → { message }  (creator only)
```

### Departments — JWT required
```
GET    /api/departements      → Departement[]   (any authenticated user)
POST   /api/departements      → Departement     Body: { nom* }   (admin)
PUT    /api/departements/:id  → Departement     Body: { nom* }   (admin)
DELETE /api/departements/:id  → { message }     (admin — cascades to its tasks, detaches employees)
```

### Clients
```
GET    /api/clients      → Client[]
GET    /api/clients/:id  → Client
POST   /api/clients      → Client   Body: { email*, nom* | raison_sociale*, type_client, ... }
PUT    /api/clients/:id  → Client
DELETE /api/clients/:id  → { message }
```

### Invoices
```
GET    /api/factures     → Invoice[]
POST   /api/factures     → Invoice  Body: { client*, montant*, statut, date_emission, date_echeance }
PUT    /api/factures/:id → Invoice
DELETE /api/factures/:id → { success: true }
```

### Calendar Events
```
GET    /api/evenements      → Event[]
GET    /api/evenements/:id  → Event
POST   /api/evenements      → Event  Body: { titre*, date_debut*, date_fin, type, description }
PUT    /api/evenements/:id  → Event
DELETE /api/evenements/:id  → { success: true }
```

### Planning (Staff Schedules)
```
GET    /api/planning      → Schedule[]  (each with employe_nom from the employes join)
POST   /api/planning      → Schedule  Body: { employe_id*, date*, heure_debut*, heure_fin*, projet }
PUT    /api/planning/:id  → Schedule
DELETE /api/planning/:id  → { success: true }
```

### Document Vault
```
GET    /api/documents                → Document[]  (query: ?dossier_id=)
POST   /api/documents/upload         → Document    Body: multipart/form-data { file, dossier_id }
GET    /api/documents/:id/download   → File stream
DELETE /api/documents/:id            → { success: true }

GET    /api/documents/dossiers       → Folder[]
POST   /api/documents/dossiers       → Folder  Body: { nom*, description, parent_id }
DELETE /api/documents/dossiers/:id   → { success: true }  (recursive delete)
```

### Employees — Admin (requires `Authorization: Bearer <token>` + `admin` role)
```
GET    /api/employes           → Employee[]  (with departement_nom)
GET    /api/employes/selector  → [{ id, nom }]  (manager|admin — minimal directory for assignee pickers)
GET    /api/employes/:id       → Employee
POST   /api/employes           → Employee  Body: { nom*, email*, password*, prenom, poste, departement_id, role }
PUT    /api/employes/:id       → Employee
DELETE /api/employes/:id       → { success: true }  (cascades: planning + todo assignments purged,
                                                     created tasks/todos keep living with created_by = NULL)
```

### Automations — Admin (requires `Authorization: Bearer <token>`)
```
GET    /api/automations      → Automation[]
POST   /api/automations      → Automation  Body: { nom*, action* }
PUT    /api/automations/:id  → Automation
DELETE /api/automations/:id  → { success: true }
```

### AI Assistant
```
POST /api/assistant   Body: { prompt* }   → { response }
```

---

## Project Structure

```
Holberton-portfolio-projet/
├── .env.example                    # Environment template (copy to lexora/.env)
├── README.md                       # This file
├── QA_REPORT.md                    # Security & integration QA report
├── docker-compose.yml              # Docker orchestration (backend + frontend)
├── Dockerfile.backend              # Node.js 18 slim image
├── Dockerfile.frontend             # Multi-stage: Vite build → Nginx serve
├── nginx.conf                      # Reverse proxy + SPA routing config
└── lexora/
    ├── .env                        # Environment variables (not committed)
    ├── .gitignore
    ├── package.json                # Shared workspace dependencies
    ├── backend/
    │   ├── env.js                  # Loads dotenv before any other module
    │   ├── index.js                # Express entry point — mounts all routes
    │   ├── package.json
    │   ├── middleware/
    │   │   └── auth.js             # JWT verification + loadUser + requireRole
    │   ├── models/
    │   │   └── db.js               # SQLite init, schema, FK migrations, admin seed
    │   ├── scripts/
    │   │   └── seed.js             # Idempotent demo data (npm run seed)
    │   ├── routes/                 # One file per business domain
    │   │   ├── auth.js             # Login → JWT
    │   │   ├── tasks.js            # Department task CRUD + status (JWT, roles)
    │   │   ├── todos.js            # Personal sticky notes + assignees (JWT)
    │   │   ├── departements.js     # Department referential (JWT, write = admin)
    │   │   ├── clients.js          # Client contact CRUD
    │   │   ├── factures.js         # Invoice CRUD
    │   │   ├── evenements.js       # Calendar event CRUD
    │   │   ├── planning.js         # Staff schedule CRUD
    │   │   ├── employes.js         # Employee CRUD (admin, JWT required)
    │   │   ├── automations.js      # Automation rule CRUD (admin, JWT required)
    │   │   ├── documents.js        # File vault: folders + upload/download
    │   │   └── assistant.js        # Proxy to Ollama LLM
    │   ├── services/
    │   │   └── ollamaService.js    # HTTP client for Ollama
    │   └── uploads/                # Uploaded files (gitignored, Docker volume)
    └── frontend/
        ├── index.html
        ├── vite.config.js          # Vite build config + /api/* dev proxy
        ├── package.json
        └── src/
            ├── main.jsx            # ReactDOM.createRoot + BrowserRouter
            ├── App.jsx             # Sidebar + route definitions + guards
            ├── index.css           # Complete design system (1,300+ lines)
            ├── contexts/
            │   ├── AuthContext.jsx  # JWT state (login, logout, authHeaders)
            │   └── ToastContext.jsx # Global toast notifications
            ├── components/
            │   ├── Tabs.jsx         # Reusable tabbed panel component
            │   └── PostItWall.jsx   # Sticky-note wall (todos) with assignees
            └── pages/
                ├── Login.jsx        # Authentication page (full-screen)
                ├── Dashboard.jsx    # KPI overview with animated counters
                ├── Taches.jsx       # Department task kanban (drag & drop)
                ├── ClientsFactures.jsx  # CRM + invoicing (tabbed)
                ├── Calendrier.jsx   # Interactive calendar (react-big-calendar)
                ├── Coffre_fort.jsx  # Document vault with folder navigation
                ├── Assistant.jsx    # AI chat interface
                ├── Equipe.jsx       # Admin panel (employees, planning, automations)
                └── MonEspace.jsx    # Employee personal space + schedule view
```

---

## Security

| Layer | Mechanism |
|-------|-----------|
| **HTTP Headers** | Helmet.js — sets 14+ security headers (CSP, HSTS, X-Frame-Options, etc.) |
| **CORS** | Strict allowlist via `ALLOWED_ORIGINS` env var |
| **Rate Limiting** | 100 requests / 15 min per IP on all `/api/*` routes |
| **Authentication** | JWT (HS256, 24h expiry) via `Authorization: Bearer` header |
| **Password Storage** | bcryptjs with 10 salt rounds |
| **Admin Routes** | JWT required on `/api/employes` and `/api/automations` |
| **File Uploads** | Multer — 50 MB limit, stored with timestamp-prefixed names |
| **Input Validation** | Required fields validated in each route before DB write |

---

## Team

Project completed as part of the **Holberton School** curriculum.

| Name | Role |
|------|------|
| **Polo** | Full-Stack Developer — Backend API, Auth, Database, Docker |
| *(co-author)* | Full-Stack Developer — Frontend React, UI/UX, Components |

---

## License

This project is an educational portfolio project — free to use for non-commercial purposes.
