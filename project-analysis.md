# CRM Application — Project Analysis

## Overview

This is a **CRM (Customer Relationship Management)** system built for managing customer interactions, orders, follow-ups, calls, and agent portfolios. It uses a **Node.js/Express backend** with **Microsoft SQL Server** and an **Angular standalone frontend**.

---

## Architecture

```
crm-app/
├── backend/          # Express 5 REST API (port 5001)
│   ├── config/       # DB connection (Sequelize + MSSQL/tedious)
│   ├── controllers/  # 11 controller files
│   ├── middleware/    # JWT auth + role-based authorization
│   ├── models/       # 9 Sequelize models with associations
│   ├── routes/       # 12 route files
│   ├── scripts/      # DB seeding, migration, cleanup scripts
│   ├── utils/        # Multer file upload configs
│   ├── uploads/      # Uploaded files storage
│   └── server.js     # Entry point
├── frontend/
│   └── crm/          # Angular 20 standalone app
│       └── src/app/
│           ├── core/         # Services, interceptors, guards
│           ├── shared/       # Auth, layout, UI components, model definitions
│           └── features/     # 13 feature modules
│               ├── auth/
│               ├── calls/
│               ├── customers/
│               ├── dashboard/
│               ├── followups/
│               ├── medicine/
│               ├── my-base/
│               ├── orders/
│               ├── folio/
│               ├── reports/
│               ├── roles/
│               ├── search/
│               └── users/
└── scripts/          # (empty)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express 5, Sequelize 6 |
| **Database** | Microsoft SQL Server (via tedious, NTLM auth) |
| **Frontend** | Angular 20.3 (standalone components), TypeScript 5.9 |
| **UI** | Bootstrap 5.3, Font Awesome 7, Chart.js 4.5, SweetAlert2 |
| **Auth** | JWT (jsonwebtoken), bcryptjs (installed but passwords stored in plain text) |
| **File Upload** | Multer 2 (Excel, CSV, images, PDFs, docs — 20MB limit) |
| **Excel** | xlsx library for parsing/spreadsheets |

---

## Backend Details

### Database (MSSQL — `crm_db`)
- **Connection**: NTLM Windows authentication via `sequelize-msnodesqlv8`
- **Instance**: `WIN-HHS668MB116\SQL_SERVER`
- **ORM**: Sequelize 6 with manual index creation for performance
- **Time zone**: IST (UTC+5:30) for all date handling

### Models (9)
| Model | Description |
|-------|-------------|
| `Role` | Roles with permissions array (Admin, Agent, Orders Viewer, Super Admin) |
| `User` | Users linked to roles, with manager hierarchy (self-referencing) |
| `Customer` | Customer records with computed `PhoneDigits` column |
| `Call` | Core entity — call logs with follow-up date, order/refund details |
| `CallAttachment` | File attachments per call |
| `CallStatusHistory` | Status change audit trail per call |
| `CustomerPortfolio` | Uploaded portfolio data (grouped by GroupId, Mobile) |
| `Session` | JWT session tracking with 30-min idle timeout |
| `AgentBase` | Agent base assignments |

### Controllers (11)
- **authController** — Login/register with plain-text password comparison, session management
- **userController** — CRUD with manager assignment, role filtering
- **roleController** — CRUD with permission array
- **customerController** — CRUD with search, keyset cursor pagination, phone normalization
- **callController** — CRUD with file upload, "First Order Wins" business logic, status history
- **orderController** — Upload orders via Excel, search, recent orders, "First Order Wins"
- **portfolioController** — Upload portfolio via Excel, search
- **customerMedicineDetailController** — CMD upload/search via Excel
- **agentBaseController** — Agent base management
- **smartfloController** — Click-to-call integration via Smartflo API
- **reportController** — Followup/order status reports with aggregation

### Middleware
- **`auth.js`** — JWT verification + session validation (30-min idle timeout) + role-based authorization (name, ID, wildcard `*`)

### Key Business Logic
- **"First Order Wins"** — When uploading orders, if a customer already has an order, the existing order is preserved (first-come-first-served)
- **Keyset/Cursor Pagination** — Used on large tables (customers, orders) for performance
- **Smartflo Click-to-Call** — Per-user API key integration for making calls from the UI

### API Routes (under `/api`)
| Route | Description |
|-------|-------------|
| `/api/auth` | Login, register, logout |
| `/api/users` | User CRUD |
| `/api/roles` | Role CRUD |
| `/api/customers` | Customer CRUD, search, pagination |
| `/api/calls` | Call CRUD, file upload, follow-up management |
| `/api/orders` | Order upload (Excel), search, recent orders |
| `/api/portfolio` | Portfolio upload (Excel), search |
| `/api/customer-medicine-details` | CMD upload/search |
| `/api/agent-base` | Agent base management |
| `/api/smartflo` | Click-to-call integration |
| `/api/reports` | Aggregated reports |
| `/api/status` | DB health check |

---

## Frontend Details

### Angular 20 — Standalone Components
- **Architecture**: Mostly standalone components with lazy-loaded routes; some legacy module-based files coexist
- **Routing**: Defined in `app.routes.ts` with a shared layout wrapper, `AuthGuard` and `AdminGuard`
- **State**: Services with BehaviorSubjects; no NgRx or similar

### Feature Modules (13)
| Feature | Components | Description |
|---------|-----------|-------------|
| **Dashboard** | `DashboardComponent` | 8 KPI cards, Chart.js, 5-min auto-refresh |
| **Auth** | `LoginComponent`, `RegisterComponent` | JWT-based auth |
| **Customers** | `CustomerList`, `CustomerDetail`, `CustomerHistory` | CRUD with history |
| **Calls** | `CallList`, `CallDetail` | Call logging, attachments |
| **Orders** | `UploadOrders`, `UploadedOrders`, `RecentOrders`, `ReorderList` | Order management |
| **Followups** | `FollowupList`, `FollowupUpload`, `FollowupHistory`, `TodayFollowups`, `ReorderHistory` | Follow-up tracking |
| **Portfolio** | `CustomerPortfolio` | Portfolio view |
| **Reports** | `ReportsMenu`, `FollowupReport`, `OrderStatusReport`, `FollowupCountsHierarchy` | Reporting |
| **Search** | `OrdersSearch`, `RefundsSearch` | Search across entities |
| **Medicine** | `CustomerMedicineDetail` | Medicine detail view |
| **My Base** | `MyBaseComponent` | Agent's base view |
| **Users** | `UserList`, `UserDetail` | User management (module-based) |
| **Roles** | `RoleList`, `RoleDetail` | Role management (module-based) |

### Core Services
- **AuthService** — JWT token management, 30-min idle timeout, session tracking
- **CustomerService** — Customer CRUD + search API
- **CallService** — Call CRUD + follow-up API
- **OrderService** — Order upload/search API
- **ReportService** — Report data API
- **RoleService** — Role CRUD API
- **AgentBaseService** — Agent base API
- **LoadingService** — Global loading state

### Interceptors
- **AuthInterceptor** — Injects JWT Bearer token
- **LoadingInterceptor** — Global spinner on HTTP requests

### Guards
- **AuthGuard** — Route protection (requires auth)
- **AdminGuard** — Admin-only route protection

### UI Features
- Collapsible sidebar navigation
- Dark/Light theme toggle (persisted to localStorage, default dark)
- Font Awesome 7 icons
- SweetAlert2 for confirmation/modals
- Bootstrap 5.3 responsive layout

---

## Key Observations

1. **Security**: Passwords are stored and compared in **plain text** (bcryptjs is listed as a dependency but unused). JWT secret is hardcoded as `your_jwt_secret` in the env file.
2. **Mixed architecture**: The frontend mixes standalone components (Angular 17+ style) with older NgModule-based patterns (users, roles modules).
3. **Dual routing**: Both `app.routes.ts` (standalone) and `app-routing-module.ts` (legacy) exist — some routes overlap.
4. **Database indexes**: Indexes for performance are created programmatically on startup via raw SQL.
5. **File uploads**: Excel files for orders, follow-ups, portfolios, and CMD data; supports images, PDFs, and docs for call attachments.
6. **Retry on startup**: The backend retries DB connection after 5 seconds on failure.
7. **Proxy config**: Frontend dev server proxies `/api` to backend at port 5001.
