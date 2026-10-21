import { AdminShell } from '@/components/admin/admin-shell';
import { StaffAdmin } from '@/components/admin/staff/staff-admin';

export default function AdminStaffPage() {
  return (
    <AdminShell section="staff">
      <StaffAdmin />
    </AdminShell>
  );
}
