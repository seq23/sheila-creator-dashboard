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
  /** "production" | "staging" | "dev" (wrangler.jsonc vars, .dev.vars). Missing reads as production. */
  ENV_NAME?: string;

  // secrets
  SESSION_SECRET: string;
  SECRETS_KEY: string;
  JOB_SHARED_SECRET: string;
  GITHUB_DISPATCH_TOKEN?: string;
  RESEND_API_KEY?: string;
  // Stats OAuth (phase 3). Optional: without them the Connect row says the stats app is not
  // set up yet and links the guide. Each is the vendor's own app credential, set once by the
  // builder with `wrangler secret put`; her tokens are stored encrypted in D1, not here.
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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

/** Which deployment this is; a job dispatch carries it so Actions picks the right Worker and secret. */
export const envName = (env: Pick<Env, "ENV_NAME">): "production" | "staging" | "dev" =>
  env.ENV_NAME === "staging" ? "staging" : env.ENV_NAME === "dev" ? "dev" : "production";
