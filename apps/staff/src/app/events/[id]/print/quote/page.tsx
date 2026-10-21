import { EventPrint } from '@/components/events/event-print';

export default async function QuotePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  return <EventPrint eventId={id} kind="quote" version={v ? Number(v) : undefined} />;
}
