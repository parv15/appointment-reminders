import { json } from './http';
import { getRuntime } from './runtime';

export async function handle(req: Request): Promise<Response> {
  try {
    const { api } = await getRuntime();
    return await api(req);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return json({ error: err instanceof Error ? err.message : 'The server could not start.' }, 500);
  }
}
