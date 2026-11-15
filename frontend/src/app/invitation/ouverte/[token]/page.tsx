import { OpenSignUpView } from '@/components/invitation/OpenSignUpView';

/** Shared invitation link: the QR printed on every paper invitation */
export default async function OpenInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OpenSignUpView token={token} />;
}
