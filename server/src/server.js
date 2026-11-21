import http from 'http';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { attachYjsWebSocketServer } from './sockets/yjsWebSocketServer.js';
import { roomManager } from './collaboration/roomManager.js';

async function startServer() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);
  attachYjsWebSocketServer(server);

  server.listen(env.port, () => {
    console.log(`[SyncSpace AI] HTTP + Yjs WebSocket Server listening on http://localhost:${env.port}`);
    console.log(`[SyncSpace AI] Yjs WS endpoint: ws://localhost:${env.port}/yjs/:documentId`);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`\n[SyncSpace AI] Received ${signal}. Persisting active Yjs rooms before exit...`);
    try {
      await roomManager.persistAndShutdownAll();
      await disconnectDB();
    } catch (err) {
      console.error('[SyncSpace AI] Error during graceful shutdown:', err);
    }
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('[SyncSpace AI] Failed to start server:', err);
  process.exit(1);
});
