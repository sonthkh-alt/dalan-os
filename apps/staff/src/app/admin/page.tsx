import { AdminHome, AdminShell } from '@/components/admin/admin-shell';

export default function AdminPage() {
  return (
    <AdminShell>
      <h1 className="mb-3 text-xl font-bold text-ink-900">Quản trị</h1>
      <AdminHome />
    </AdminShell>
  );
}
