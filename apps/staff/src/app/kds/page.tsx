import { AppShell } from '@/components/shell/app-shell';
import { KdsScreen } from '@/components/kds/kds-screen';

export default function KdsPage() {
  return (
    <AppShell fullscreen>
      <KdsScreen />
    </AppShell>
  );
}
