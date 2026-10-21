import { PublicMenu } from './PublicMenu';

export default async function PublicMenuPage({ params }: { params: Promise<{ branchCode: string }> }) {
  const { branchCode } = await params;
  return <PublicMenu branchCode={branchCode} />;
}
