import { AdminShell } from '@/components/admin/admin-shell';
import { MenuAdmin } from '@/components/admin/menu/menu-admin';

export default function AdminMenuPage() {
  return (
    <AdminShell section="menu">
      <MenuAdmin />
    </AdminShell>
  );
}
