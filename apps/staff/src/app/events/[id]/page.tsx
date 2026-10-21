import { AppShell } from '@/components/shell/app-shell';
import { EventDetailScreen } from '@/components/events/event-detail';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <EventDetailScreen eventId={id} />
    </AppShell>
  );
}
