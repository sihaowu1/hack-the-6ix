/** Client-side Auth0 config from Vite env (repo-root `.env`). */

const domain = (import.meta.env.VITE_AUTH0_DOMAIN as string | undefined)?.trim() ?? '';
const clientId = (import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined)?.trim() ?? '';
const audience = (import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined)?.trim() ?? '';

/** True when the SPA can talk to Auth0 (domain + client id present). */
export const isAuthConfigured = Boolean(domain && clientId);

export const auth0Config = {
  domain,
  clientId,
  audience,
} as const;
