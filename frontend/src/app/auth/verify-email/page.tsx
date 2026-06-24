import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Verify Email' };

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-500/20 border-2 border-indigo-400 mb-6">
          <svg className="w-10 h-10 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Check Your Email</h1>
        <p className="text-indigo-200 mb-6 leading-relaxed">
          We&apos;ve sent a verification link to your email address. Click the link in the email to verify your account.
        </p>
        <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 mb-6">
          <p className="text-indigo-100 text-sm">Didn&apos;t receive the email? Check your spam folder or</p>
          <button className="text-indigo-300 hover:text-white underline text-sm mt-1 transition-colors">
            Resend verification email
          </button>
        </div>
        <a href="/auth/login" className="text-indigo-300 hover:text-white text-sm underline transition-colors">
          Back to Sign In
        </a>
      </div>
    </div>
  );
}
