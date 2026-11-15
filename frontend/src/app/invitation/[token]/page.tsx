import { GuestRsvpView } from '@/components/invitation/GuestRsvpView';

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestRsvpView token={token} />;
}
