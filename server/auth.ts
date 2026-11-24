import { betterAuth } from 'better-auth';
import type { Env } from './env';
async function mail(env: Env, to: string, subject: string, url: string) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error('Account email is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject,
      text: `${subject}\n\n${url}\n\nIf you did not request this action, ignore this email.`,
    }),
  });
  if (!response.ok) throw new Error('Account email delivery failed');
}
export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    trustedOrigins: [env.APP_URL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        mail(env, user.email, 'Reset your CommiLedger password', url),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        mail(env, user.email, 'Verify your CommiLedger email', url),
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 60 * 10 },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith('https:'),
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 3600, max: 5 },
        '/request-password-reset': { window: 3600, max: 5 },
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const active = await env.DB.prepare(
            "SELECT id FROM subscriptions WHERE user_id=? AND status NOT IN ('canceled','paused') LIMIT 1",
          )
            .bind(user.id)
            .first();
          if (active)
            throw new Error(
              'Cancel your subscription and wait for its effective end before deleting your account.',
            );
        },
        sendDeleteAccountVerification: async ({ user, url }) =>
          mail(env, user.email, 'Confirm deletion of your CommiLedger account', url),
      },
    },
  });
}
