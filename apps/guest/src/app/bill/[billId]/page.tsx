import { BillDetail } from './BillDetail';

export default async function BillDetailPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  return <BillDetail billId={billId} />;
}
