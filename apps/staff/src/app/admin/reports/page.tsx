import { AdminShell } from '@/components/admin/admin-shell';
import { ReportsAdmin } from '@/components/admin/reports/reports-admin';

export default function AdminReportsPage() {
  return (
    <AdminShell section="reports">
      <ReportsAdmin />
    </AdminShell>
  );
}
