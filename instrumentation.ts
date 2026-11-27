export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getRuntime } = await import('./src/runtime');
  await getRuntime().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
  });
}
