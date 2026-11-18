import { UnsubscribeView } from '@/components/communication/UnsubscribeView';

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UnsubscribeView token={token} />;
}
