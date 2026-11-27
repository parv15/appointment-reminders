import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { adminSession } from '@/src/next-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin sign in' };

export default async function LoginPage() {
  const { required, signedIn } = await adminSession();
  if (!required || signedIn) redirect('/admin');
  return <LoginForm />;
}
