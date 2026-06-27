import { redirect } from 'next/navigation';

// Fallback for environments where middleware is not active.
// In production, the middleware handles subdomain-based routing.
export default function RootPage() {
  redirect('/billetterie');
}
