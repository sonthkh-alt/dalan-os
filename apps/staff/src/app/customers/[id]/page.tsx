import { AppShell } from '@/components/shell/app-shell';
import { CustomerDetailScreen } from '@/components/customers/customer-detail';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <CustomerDetailScreen customerId={id} />
    </AppShell>
  );
}
