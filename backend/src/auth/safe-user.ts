/**
 * User as sent to the browser or the app: without the password, tokens and the 2FA secret.
 * The login used to return the TOTP secret, so any script or proxy that saw that response
 * could produce the second factor forever.
 */
export function safeUser<T extends Record<string, any>>(user: T) {
  const {
    password: _password,
    refreshToken: _refreshToken,
    twoFactorSecret: _twoFactorSecret,
    passwordResetToken: _passwordResetToken,
    passwordResetExpiry: _passwordResetExpiry,
    emailVerificationToken: _emailVerificationToken,
    emailVerificationExpiry: _emailVerificationExpiry,
    ...rest
  } = user;
  return rest;
}
