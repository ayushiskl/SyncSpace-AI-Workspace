# SyncSpace AI — Scalability & Performance Design Note

**Prompt Question:** *"How would you build this for 20,000 live documents, with up to 100 editors on one of them?"*

> **MVP vs. Production Scope Notice:** The current implementation in this repository is a single-node MVP (Express + `ws` + in-memory `RoomManager` + MongoDB persistence) verified by automated concurrency and persistence tests. It has **not** been load-tested against 20,000 live documents. Below is the production-scale architecture required to reach that target cleanly from this exact Yjs foundation.

---

## Production Architecture for 20,000 Live Documents & 100 Concurrent Editors

- **1. Room-Partitioned Collaboration with Consistent-Hash Affinity:**
  Every document maps to an isolated logical room (`documentId`) owning a single active `Y.Doc` and `Awareness` state. At the edge, a Layer-7 WebSocket gateway (Envoy / NGINX / ALB) routes `/yjs/:documentId` using consistent hashing on `documentId` so all editors for the same document preferentially land on the same collaboration worker pod. With 20,000 live documents (~150–300 KB RAM per warm `Y.Doc` ≈ 3–6 GB total), partitioning across 8–12 stateless-fronted collaboration nodes keeps memory usage per node under 1 GB and eliminates unnecessary cross-node traffic for 99% of rooms.

- **2. Horizontal WebSocket Scaling & Stateless API Tier Separation:**
  Split the monolithic MVP process into two independently scalable tiers: (a) a stateless REST + AI Orchestration API cluster (handling auth, metadata CRUD, and Gemini calls behind standard load balancing), and (b) a dedicated WebSocket Collaboration cluster holding active `Y.Doc` instances. AI workers never need to hold long-lived editor sockets—they read the document's live state vector/anchors and submit surgical CRDT updates to the room's owning collaboration node (or via the message bus).

- **3. Cross-Instance Synchronization via Redis Pub/Sub (or NATS JetStream):**
  When consistent hashing shifts during autoscaling, rolling deploys, or when an ultra-hot document (100 concurrent editors) spans multiple pods, each room subscribes to two lightweight channels: `doc:<id>:updates` (binary Yjs incremental updates) and `doc:<id>:awareness` (ephemeral cursor/presence frames). Publishing compact binary `Uint8Array` deltas (typically 20–150 bytes per keystroke) over Redis Pub/Sub or NATS guarantees strong eventual consistency across instances because Yjs CRDT updates are commutative, associative, and idempotent.

- **4. Append-Only Update Log + Periodic Compacted MongoDB Snapshots:**
  Instead of re-encoding and writing full `Y.encodeStateAsUpdate(doc)` snapshots on every debounce interval under 100-editor load, production persistence uses a two-layer storage model in MongoDB (or S3/GCS + MongoDB metadata): (a) fast append-only incremental Yjs update chunks flushed in 500ms–1s batches, and (b) asynchronous background compaction every $N$ updates (e.g., 500 updates or 5 minutes) that merges chunks via `Y.mergeUpdates()` into a single `DocumentSnapshot` record and prunes compacted deltas. Document metadata, ACLs, and `AgentExecution` audit logs remain in indexed MongoDB collections.

- **5. Memory Management, Idle Room Eviction & Fast Cold Recovery:**
  Each collaboration worker tracks `activeConnections` and `lastActivityAt` per room (already scaffolded in MVP `RoomManager` via `ROOM_IDLE_TIMEOUT_MS`). When `activeConnections === 0` for a grace period (e.g., 60–180 seconds), the node flushes any pending deltas, verifies durable persistence, unsubscribes from Redis channels, and calls `ydoc.destroy()` to free V8 heap immediately. When a user returns, the room cold-starts in milliseconds by loading the latest compacted snapshot plus any trailing update deltas from MongoDB.

- **6. Backpressure, Rate Limits, Broadcast Batching & Observability for 100-Editor Hot Rooms:**
  For a single document with 100 simultaneous editors, naïve $O(N^2)$ per-keystroke awareness and update fanout becomes the main bottleneck ($100 \times 100 = 10{,}000$ frames/sec). Production handles this via:
  - **Update & Awareness Coalescing:** Batch incoming Yjs updates per room over a 30–50ms micro-window using `Y.mergeUpdates()` and throttle awareness cursor broadcasts to ~10–15 Hz, cutting WebSocket frame fanout by >85% without perceptible lag.
  - **Per-Socket Backpressure & Connection Caps:** Monitor `ws.bufferedAmount`; drop stale awareness frames first for slow consumers, disconnect stalled sockets above a hard buffer threshold (e.g., 2 MB) so they cleanly resync via `SyncStep1/SyncStep2` on reconnect, and enforce per-user/per-room connection limits and token-bucket rate limits on AI executions.
  - **Monitoring:** Export Prometheus metrics per worker (`active_rooms`, `ws_connections`, `yjs_update_bytes_sec`, `room_merge_latency_ms`, `ai_conflict_rate`, `heap_used_bytes`) to drive HPA autoscaling and hotspot alerts.

---

## Implemented MVP vs. Production-Scale Comparison

| Capability | Implemented MVP (This Repo) | Production Scale (20k Docs / 100 Editors) |
| :--- | :--- | :--- |
| **CRDT State & Wire Protocol** | Yjs `Y.Doc` + `y-protocols` sync & awareness over `ws` | Identical Yjs CRDT core + binary protocol |
| **Room Management** | Single-node in-memory `RoomManager` with idle eviction | Consistent-hashed multi-pod WS cluster + idle eviction |
| **Cross-Node Sync** | Single process (direct in-memory broadcast) | Redis Pub/Sub / NATS JetStream per-room binary channels |
| **Persistence** | Debounced full Yjs snapshots in MongoDB (`DocumentSnapshot`) | Append-only batched update log + background `Y.mergeUpdates` compaction |
| **100-Editor Hot Room Fanout** | Direct per-update broadcast | 30–50ms `Y.mergeUpdates` batching + 10–15Hz awareness throttling + `bufferedAmount` backpressure |
| **AI Concurrency Protection** | `Y.RelativePosition` anchors + 3-way merge + Conflict Review UI | Identical CRDT anchoring & 3-way merge, offloaded to stateless AI worker queue |
