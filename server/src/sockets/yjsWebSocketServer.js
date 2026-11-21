import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';
import { roomManager } from '../collaboration/roomManager.js';

function rejectUpgrade(socket, statusCode, message) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`
  );
  socket.destroy();
}

/**
 * Attach authenticated Yjs WebSocket collaboration server to an existing HTTP server.
 * Endpoint: ws://<host>/yjs/<documentId>?token=<jwt>
 */
export function attachYjsWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      if (!pathname.startsWith('/yjs/')) {
        return rejectUpgrade(socket, 404, 'Not Found');
      }

      const documentId = decodeURIComponent(pathname.replace(/^\/yjs\//, '').split('/')[0]);
      if (!mongoose.Types.ObjectId.isValid(documentId)) {
        return rejectUpgrade(socket, 400, 'Invalid Document ID');
      }

      // Extract JWT from query param (standard for browser WebSockets) or Authorization header
      const authHeader = request.headers.authorization || '';
      const token =
        url.searchParams.get('token') ||
        (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

      if (!token) {
        return rejectUpgrade(socket, 401, 'Authentication Required');
      }

      let decoded;
      try {
        decoded = jwt.verify(token, env.jwtSecret);
      } catch {
        return rejectUpgrade(socket, 401, 'Invalid or Expired Token');
      }

      const user = await User.findById(decoded.id);
      if (!user) {
        return rejectUpgrade(socket, 401, 'User Not Found');
      }

      const docRecord = await Document.findById(documentId);
      if (!docRecord) {
        return rejectUpgrade(socket, 404, 'Document Not Found');
      }

      const role = docRecord.getUserRole(user._id);
      if (!role) {
        return rejectUpgrade(socket, 403, 'Access Denied to Document');
      }

      const room = await roomManager.getOrCreateRoom(documentId);

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        room.addConnection(ws, {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          cursorColor: user.cursorColor,
          role,
        });
      });
    } catch (err) {
      console.error('[YjsWS] Upgrade error:', err.message);
      rejectUpgrade(socket, 500, 'Internal Collaboration Error');
    }
  });

  return wss;
}
