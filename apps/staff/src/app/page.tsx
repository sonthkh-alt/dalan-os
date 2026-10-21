import { AppShell } from '@/components/shell/app-shell';
import { FloorScreen } from '@/components/floor/floor-screen';

export default function HomePage() {
  return (
    <AppShell>
      <FloorScreen />
    </AppShell>
  );
}
