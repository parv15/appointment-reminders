import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminDashboard } from '@/components/AdminDashboard';
import { adminSession } from '@/src/next-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage() {
  const { required, signedIn } = await adminSession();
  if (required && !signedIn) redirect('/admin/login');
  return <AdminDashboard signOutAvailable={required} />;
}
