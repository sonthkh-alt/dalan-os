import { AdminShell } from '@/components/admin/admin-shell';
import { FloorAdmin } from '@/components/admin/floor/floor-admin';

export default function AdminFloorPage() {
  return (
    <AdminShell section="floor">
      <FloorAdmin />
    </AdminShell>
  );
}
