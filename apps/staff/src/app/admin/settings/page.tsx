import { AdminShell } from '@/components/admin/admin-shell';
import { SettingsAdmin } from '@/components/admin/settings/settings-admin';

export default function AdminSettingsPage() {
  return (
    <AdminShell section="settings">
      <SettingsAdmin />
    </AdminShell>
  );
}
