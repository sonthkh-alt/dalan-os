import { AppShell } from '@/components/shell/app-shell';
import { InventoryScreen } from '@/components/inventory/inventory-screen';

export default function InventoryPage() {
  return (
    <AppShell>
      <InventoryScreen />
    </AppShell>
  );
}
