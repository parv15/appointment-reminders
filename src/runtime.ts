import { createRuntime, type Runtime } from './bootstrap';

const globalStore = globalThis as typeof globalThis & { __reminderRuntime?: Promise<Runtime> };

export function getRuntime(): Promise<Runtime> {
  globalStore.__reminderRuntime ??= createRuntime().catch((err) => {
    globalStore.__reminderRuntime = undefined;
    throw err;
  });
  return globalStore.__reminderRuntime;
}
