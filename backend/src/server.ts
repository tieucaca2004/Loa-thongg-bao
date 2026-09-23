import { loadConfig } from './config.js';
import { createLogger } from './lib/logger.js';
import { openDatabase } from './db/index.js';
import { PaymentEventBus } from './services/events/eventBus.js';
import { startEventWsServer } from './services/events/wsServer.js';
import { buildApp } from './app.js';

async function main() {
  const config = loadConfig();
  const log = createLogger(config);

  const db = openDatabase(config.DATABASE_PATH);
  const events = new PaymentEventBus();

  const app = buildApp({ config, log, db, events });

  startEventWsServer(config.DESKTOP_EVENT_WS_PORT, events, log);

  await app.listen({ port: config.PORT, host: config.HOST });
  log.info(
    { port: config.PORT, wsPort: config.DESKTOP_EVENT_WS_PORT },
    'A Tieu Payment Engine backend started'
  );

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
