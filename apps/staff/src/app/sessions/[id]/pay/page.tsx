import { AppShell } from '@/components/shell/app-shell';
import { PayScreen } from '@/components/pay/pay-screen';

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PayScreen sessionId={id} />
    </AppShell>
  );
}
