import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRuntime, type Runtime } from './bootstrap.js';

let runtime: Promise<Runtime> | undefined;

export default async function handle(req: IncomingMessage, res: ServerResponse) {
  runtime ??= createRuntime().catch((err) => {
    runtime = undefined;
    throw err;
  });

  try {
    (await runtime).app(req, res);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'The server could not start.' }));
  }
}
