import { AdminShell } from '@/components/admin/admin-shell';
import { AuditAdmin } from '@/components/admin/audit/audit-admin';

export default function AdminAuditPage() {
  return (
    <AdminShell section="audit">
      <AuditAdmin />
    </AdminShell>
  );
}
