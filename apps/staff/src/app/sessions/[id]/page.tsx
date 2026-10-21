import { AppShell } from '@/components/shell/app-shell';
import { SessionScreen } from '@/components/order/session-screen';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <SessionScreen sessionId={id} />
    </AppShell>
  );
}
