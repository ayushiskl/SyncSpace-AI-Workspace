# SyncSpace AI — Real-Time Collaborative Document Workspace for Humans & AI Agents

> **Where Humans and AI Create Together — without ever losing concurrent human edits.**

SyncSpace AI is a full-stack real-time collaborative document workspace built on **Yjs CRDTs**, **Tiptap**, **Express + WebSockets**, **MongoDB**, and the **Google Gemini API**. It directly solves the hardest concurrency challenge in AI-powered collaborative editors: **preserving concurrent human edits when an AI agent generates a large rewrite from an older document version.**

---

## Problem Statement

In modern collaborative editors, multiple humans and AI agents edit the same document simultaneously:
1. User A and User B open a shared document and type together in real time.
2. User A instructs the AI agent: *"Rewrite section 3."*
3. While the AI processes Section 3 asynchronously, User B continues editing Section 3.
4. When the AI returns its rewrite, blindly replacing Section 3 would **destroy User B's newer edits**.

SyncSpace AI guarantees:
- **Zero lost human edits** through Yjs CRDT relative-position anchoring and a **Three-Way Merge Engine**.
- **Strong eventual consistency** across all connected clients via incremental Yjs binary updates.
- **Explicit human-in-the-loop conflict review** whenever human and AI changes overlap semantically.
- **Durable persistence & recovery** using binary Yjs snapshots stored in MongoDB.

---

## Key Features

- **Real-Time Rich-Text Collaboration:** Tiptap editor bound directly to `Y.XmlFragment('default')` supporting H1–H3, formatting (bold, italic, underline, strikethrough), lists, blockquotes, inline & block code, links, and CRDT-safe undo/redo.
- **Live Cursors & Presence:** Powered by `y-protocols/awareness` showing colored collaborator cursors, online user avatars, and live **Writing Assistant (AI)** active presence badges.
- **CRDT-Safe Concurrent AI Editing (`Writing Assistant`):**
  - Captures exact `Y.encodeStateVector(doc)` and `Y.RelativePosition` anchors before calling Google Gemini.
  - Sends **only** the targeted section/selection + minimal heading outline to Gemini (never regenerates the full document).
  - Runs a **Three-Way Merge** (`originalContent` vs `liveCurrentContent` vs `proposedContent`) when Gemini responds.
  - Auto-merges strictly non-overlapping edits while preserving 100% of human edits; flags overlapping edits as `Conflict` with a 3-way visual diff and editable merge review UI.
  - Commits approved changes via **minimal surgical CRDT diffs** inside `ydoc.transact(..., 'ai-agent')`.
- **Authentication & Access Control:** JWT authentication with `bcryptjs` password hashing and per-document authorization (`owner`, `editor`, `viewer`, and link-share permissions) enforced on both REST APIs and WebSocket upgrade handshakes.
- **Durable Persistence & Audit Trail:** Debounced + manual binary Yjs snapshots in MongoDB, automatic idle room cleanup, AI execution history, and live document activity feed.
- **Modern SaaS UI:** Premium light & dark themes, landing page, document dashboard with search/filters, share modal, interactive heading outline, and 3-pane workspace.

---

## Screenshots / UI Overview

*(Add your local screenshots here after running the application)*
- **Landing Page:** Hero with live human + AI merge preview, feature grid, and architecture overview.
- **Dashboard:** Recent / My Documents / Shared with Me filters, search, active live collaborator badges, and 3-section starter template creation.
- **Collaborative Workspace:** 3-pane layout (Left Outline & Activity Sidebar · Center Tiptap CRDT Editor with Live Cursors · Right Gemini Writing Assistant & 3-Way Conflict Review Panel).

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Tiptap (`@tiptap/react`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`), Yjs, `y-websocket`, React Router, Axios, Lucide React, Framer Motion, `diff` |
| **Backend** | Node.js (ESM), Express.js, `ws`, Yjs, `y-protocols`, `lib0`, MongoDB, Mongoose, JWT, `bcryptjs`, Helmet, Rate Limiting, `diff` |
| **AI Integration** | Google Gemini API (`@google/generative-ai`) — server-side only |
| **Testing** | Vitest, Supertest, `mongodb-memory-server`, real WebSocket Yjs clients |

---

## System Architecture

```text
┌───────────────────────────┐        ┌───────────────────────────┐
│  Browser Client A (React) │        │  Browser Client B (React) │
│  Tiptap + Y.Doc + Cursor  │        │  Tiptap + Y.Doc + Cursor  │
└─────────────┬─────────────┘        └─────────────┬─────────────┘
              │  WS /yjs/:docId?token=JWT          │
              │  (Incremental Yjs Sync & Awareness)│
              └─────────────────┬──────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│             SyncSpace AI Backend (Node.js + Express)            │
│                                                                 │
│  ┌──────────────────────────┐    ┌───────────────────────────┐  │
│  │   RoomManager (Yjs WS)   │◄──►│   AI Agent Orchestrator   │  │
│  │  • Per-doc Y.Doc & Room  │    │  • Section/Selection Pick │  │
│  │  • JWT + RBAC Upgrade    │    │  • Y.RelativePosition Cap │  │
│  │  • Awareness Broadcast   │    │  • 3-Way Merge Engine     │  │
│  │  • Debounced Snapshots   │    │  • Surgical CRDT Diffs    │  │
│  └────────────┬─────────────┘    └─────────────┬─────────────┘  │
└───────────────┼────────────────────────────────┼────────────────┘
                ▼                                ▼
       ┌─────────────────┐             ┌───────────────────┐
       │     MongoDB     │             │ Google Gemini API │
       │  • Users        │             │ (Server-side key) │
       │  • Documents    │             └───────────────────┘
       │  • Snapshots    │
       │  • AI Executions│
       │  • Activities   │
       └─────────────────┘
```

---

## How Yjs, Concurrent Editing & AI Conflict Resolution Work

### 1. Yjs CRDT Source of Truth
Each document is backed by a shared `Y.Doc` containing `Y.XmlFragment('default')`. Tiptap binds directly to this CRDT structure via `@tiptap/extension-collaboration`. Rather than sending full HTML blobs over REST, clients exchange compact binary `y-protocols/sync` updates over authenticated WebSockets. Because CRDT updates are commutative and idempotent, all clients—even after temporary offline partitions—converge to the exact same state.

### 2. Targeted AI Execution & Relative Anchoring
When a user runs an instruction (e.g., `"Rewrite section 3"`):
1. `resolveTargetSection()` identifies the exact `Y.XmlText` block(s) or selected substring.
2. `captureTargetAnchors()` records `Y.encodeStateVector(doc)` and `Y.createRelativePositionFromTypeIndex(...)` anchors for the start and end of the target region. Even if humans insert or delete paragraphs above Section 3 while Gemini runs, the relative anchors still resolve to the exact target text!
3. The server broadcasts live AI presence via `Awareness` and calls Gemini asynchronously while humans continue typing uninterrupted.

### 3. Three-Way Merge & Conflict Resolution Strategy
When Gemini returns `proposedContent`, `analyzeThreeWayMerge(originalContent, liveCurrentContent, proposedContent)` compares base→human edit spans against base→AI edit spans:
- **No concurrent human edits (`clean-apply`):** Status is `Completed`. Clicking **Apply** commits minimal word/char-level `delete`/`insert` CRDT ops inside a single `ydoc.transact(..., 'ai-agent')` transaction.
- **Disjoint concurrent human edits (`three-way-safe-merge`):** Human edited a non-overlapping clause/sentence in the same section. The engine produces `safeMergedContent` combining **100% of human edits + all non-overlapping AI edits**.
- **Overlapping concurrent human edits (`Conflict`):** Human edited text overlapping an AI rewrite span. Auto-overwrite is blocked (HTTP `409 CONCURRENT_EDIT_CONFLICT` on blind `apply_safe`). The right-side **AI Edit Review** displays Original, Current Live, AI Proposed, and Conflict Spans, letting the human choose **Apply Safe / Merged** (editable merge box preserving human edits), **Use AI Only**, or **Reject**.
- **Pre-apply Live Re-check:** Right before committing any proposal to `Y.Doc`, the server re-resolves the live anchors to catch any last-second human edits made while the user was reading the review card.

---

## Database Schema (MongoDB / Mongoose)

- **`User`**: `name`, `email` (unique), `password` (bcrypt hashed), `avatar`, `cursorColor`, `createdAt`
- **`Document`**: `title`, `ownerId`, `collaborators [{ userId, role }]`, `permissions { publicAccess, allowAI }`, `lastEditedBy`, `excerpt`, `currentVersion`, `createdAt`, `updatedAt`
- **`DocumentSnapshot`**: `documentId`, `snapshotData` (`Buffer` of `Y.encodeStateAsUpdate`), `stateVector` (`Buffer`), `version`, `plainTextPreview`, `createdBy`, `createdAt`
- **`AgentExecution`**: `documentId`, `userId`, `agentName`, `actionType`, `instruction`, `targetSection`, `originalContent`, `proposedContent`, `currentContentAtCompletion`, `safeMergedContent`, `baseVersion`, `baseStateVector`, `anchorSnapshot`, `mergeAnalysis`, `status`, `resolutionMode`, `createdAt`, `completedAt`, `appliedAt`
- **`Activity`**: `documentId`, `userId`, `action`, `description`, `metadata`, `timestamp`

---

## API Documentation

### Authentication
- `POST /api/auth/register` — Register a new user (`{ name, email, password }`)
- `POST /api/auth/login` — Authenticate and receive JWT (`{ email, password }`)
- `GET /api/auth/me` — Get current authenticated user profile

### Documents & Collaboration
- `POST /api/documents` — Create document (`{ title, seedTemplate }`)
- `GET /api/documents` — List accessible documents (`?filter=all|mine|shared&search=...`)
- `GET /api/documents/:id` — Fetch document metadata, permissions, and live active users
- `PATCH /api/documents/:id` — Rename document, update link permissions, add/remove collaborators
- `DELETE /api/documents/:id` — Delete document, snapshots, executions, and activity (Owner only)
- `GET /api/documents/:id/snapshot` — Get latest Yjs snapshot state, version, and parsed sections
- `POST /api/documents/:id/snapshot` — Persist live room Y.Doc snapshot immediately
- `GET /api/documents/:id/activity` — Fetch recent document & AI activity log
- `WS /yjs/:documentId?token=<jwt>` — Authenticated Yjs CRDT synchronization & awareness channel

### AI Writing Assistant
- `POST /api/ai/rewrite` — Rewrite targeted section or selection
- `POST /api/ai/summarize` — Summarize targeted section or document
- `POST /api/ai/improve` — Improve grammar, clarity, and style
- `POST /api/ai/execute` — Execute custom AI instruction (`grammar`, `expand`, `tone`, `headings`, `custom`)
- `GET /api/ai/executions/:documentId` — Fetch AI execution history for a document
- `GET /api/ai/executions/:id/live-check` — Re-evaluate live 3-way merge status before applying
- `POST /api/ai/executions/:id/apply` — Commit proposal (`mode: 'apply_safe' | 'accept_merged' | 'accept_ai'`)
- `POST /api/ai/executions/:id/reject` — Reject AI proposal

---

## Installation & Setup

### Prerequisites
- **Node.js** v20+ (tested on Node v22)
- **MongoDB** (local MongoDB instance or MongoDB Atlas URI)
- **Google Gemini API Key** (from Google AI Studio)

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Configure Environment Variables
Copy the example files and fill in your credentials:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

**`server/.env`:**
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/syncspace-ai
JWT_SECRET=your-strong-secret-key
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
SNAPSHOT_DEBOUNCE_MS=3000
ROOM_IDLE_TIMEOUT_MS=300000
```

**`client/.env`:**
```env
VITE_API_URL=http://localhost:5000/api
VITE_WS_URL=ws://localhost:5000/yjs
```

> **Security Note:** `GEMINI_API_KEY` is stored strictly on the backend and never exposed to client code.

### 3. Run Frontend & Backend
```bash
# Run both server (port 5000) and client (port 5173) together:
npm run dev

# Or run separately:
npm run dev:server
npm run dev:client
```

Open **http://localhost:5173** in two browser windows (or an incognito window with a second account) to test live multi-user collaboration + concurrent AI editing!

---

## Running Automated Tests

```bash
npm test
```

The automated test suite (Vitest + Supertest + `mongodb-memory-server` + live Yjs WebSocket clients) verifies:
1. Three-way concurrent merge engine (clean apply, disjoint auto-merge, overlapping conflict detection).
2. Yjs `RelativePosition` anchor stability when earlier paragraphs are inserted concurrently.
3. Offline partition editing & CRDT reconnection convergence.
4. Binary snapshot persistence & full recovery across simulated server restarts.
5. JWT authentication and RBAC authorization on both REST APIs and WebSocket room upgrades.
6. End-to-end **Concurrent Human + AI Editing** scenario (human edits Section 3 while AI is processing an older snapshot → human edits preserved, safe merge or conflict review enforced, all clients converge identically).

---

## Scalability Design Note

See [DESIGN.md](./DESIGN.md) for the detailed production architecture scaling SyncSpace AI to **20,000 live documents and up to 100 concurrent editors per document** (consistent-hashed room partitioning, Redis Pub/Sub cross-node fanout, append-only delta persistence + compaction, update coalescing, and backpressure controls).

---

## Current Limitations & Future Improvements

### Current Limitations
- Single-node in-memory `RoomManager` in the MVP (horizontal multi-node Redis Pub/Sub adapter is architected in `DESIGN.md` but not enabled in single-node dev mode).
- Rich inline formatting marks (e.g., bold/italic spans) inside an AI-rewritten sentence are replaced as plain text in the modified words, while untouched surrounding text preserves marks.
- Snapshot persistence currently writes full Yjs state snapshots rather than append-only incremental delta logs.

### Future Improvements
- Redis Pub/Sub / NATS cross-instance sync adapter for multi-pod deployments.
- Inline threaded comments anchored to `Y.RelativePosition`.
- Version history timeline with point-in-time snapshot diffing and one-click restore.
- Multi-agent workflows (Fact-Checker Agent + Style Editor Agent operating with separate CRDT awareness cursors).
