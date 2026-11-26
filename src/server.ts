import { createRuntime, StartupError, type Runtime } from './bootstrap.js';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let runtime: Runtime;
try {
  runtime = await createRuntime();
} catch (err) {
  if (err instanceof StartupError) fail(err.message);
  throw err;
}

const { config, store, app } = runtime;

const server = app.listen(config.port, (err?: NodeJS.ErrnoException) => {
  if (err) {
    fail(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT to another value.` : `Cannot listen on port ${config.port}: ${err.message}`);
  }
  console.log(`Appointment reminders listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    void store.close().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled error:', reason);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
