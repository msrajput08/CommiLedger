export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_PLUS_PRICE_ID?: string;
  PADDLE_PRO_PRICE_ID?: string;
  PADDLE_ENV?: 'sandbox' | 'production';
  BILLING_ENABLED?: string;
  SUPPORT_EMAIL?: string;
};
export const authReady = (e: Env) =>
  !!(
    e.DB &&
    e.BETTER_AUTH_SECRET &&
    e.BETTER_AUTH_SECRET.length >= 32 &&
    e.RESEND_API_KEY &&
    e.MAIL_FROM &&
    e.APP_URL
  );
export const billingReady = (e: Env) =>
  authReady(e) &&
  e.BILLING_ENABLED === 'true' &&
  !!(
    e.PADDLE_API_KEY &&
    e.PADDLE_WEBHOOK_SECRET &&
    e.PADDLE_PLUS_PRICE_ID &&
    e.PADDLE_PRO_PRICE_ID
  );
