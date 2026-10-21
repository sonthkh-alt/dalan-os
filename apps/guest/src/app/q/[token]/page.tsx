import { Landing } from './Landing';

export default async function QrLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Landing token={token} />;
}
