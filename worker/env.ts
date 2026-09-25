export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;

  APP_NAME: string;
  OWNER_EMAIL: string;
  FAKE_SERVICES: string;
  PUBLIC_BASE_URL: string;
  GITHUB_REPO: string;
  AUDIENCE_TIMEZONE: string;

  // secrets
  SESSION_SECRET: string;
  SECRETS_KEY: string;
  JOB_SHARED_SECRET: string;
  GITHUB_DISPATCH_TOKEN?: string;
  RESEND_API_KEY?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  role: "owner" | "helper";
}

/** Hono context variables set by middleware. */
export type Vars = {
  user: SessionUser;
  fake: boolean;
};

export const fakeServices = (env: Env): boolean => env.FAKE_SERVICES === "1";
