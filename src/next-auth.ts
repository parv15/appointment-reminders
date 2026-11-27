import 'server-only';
import { cookies } from 'next/headers';
import { createAdminAuth, SESSION_COOKIE } from './auth';
import { loadConfig } from './config';

export async function adminSession(): Promise<{ required: boolean; signedIn: boolean }> {
  const config = loadConfig();
  const auth = createAdminAuth(config.adminPassword, config.trustProxy);
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return { required: auth.enabled, signedIn: auth.isSignedIn(value ? `${SESSION_COOKIE}=${value}` : null) };
}
