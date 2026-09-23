import { WebSocketServer, WebSocket } from 'ws';
import type { Logger } from '../../lib/logger.js';
import type { PaymentEventBus } from './eventBus.js';

/**
 * Broadcasts PAYMENT_RECEIVED events to connected desktop clients over
 * WebSocket. This is intentionally decoupled from the webhook handler: the
 * webhook always succeeds/persists even if no desktop is connected (see
 * docs/ARCHITECTURE.md - "webhook handler must not depend on desktop app").
 */
export function startEventWsServer(port: number, bus: PaymentEventBus, log: Logger): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  wss.on('connection', (socket, req) => {
    clients.add(socket);
    log.info({ remoteAddress: req.socket.remoteAddress, clientCount: clients.size }, 'desktop client connected');

    socket.send(JSON.stringify({ type: 'CONNECTED' }));

    socket.on('close', () => {
      clients.delete(socket);
      log.info({ clientCount: clients.size }, 'desktop client disconnected');
    });

    socket.on('error', (err) => {
      log.warn({ err: err.message }, 'desktop websocket error');
    });
  });

  bus.subscribe((event) => {
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  log.info({ port }, 'payment event WebSocket server listening');
  return wss;
}
