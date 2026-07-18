import type { RequestHandler } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';
import { auth0Configured, config } from '../config';

/**
 * Auth0 JWT validation for `/api/*`.
 *
 * Auth is optional for the product: core generate/modify/export flows work
 * anonymously. When Auth0 is configured we still mount a check that:
 * - accepts requests with no `Authorization` header (anonymous),
 * - validates the Bearer JWT when one is present (rejects bad tokens).
 *
 * Use `requireAuth` on routes that need a signed-in user (e.g. GitHub push).
 */

const jwtCheck: RequestHandler | null = auth0Configured
  ? auth({
      audience: config.auth0.audience,
      issuerBaseURL: `https://${config.auth0.domain}/`,
      tokenSigningAlg: 'RS256',
    })
  : null;

/** Soft auth for the whole `/api` router — anonymous OK, bad tokens rejected. */
export const optionalAuth: RequestHandler = (req, res, next) => {
  if (!jwtCheck) return next();
  if (!req.headers.authorization) return next();
  return jwtCheck(req, res, next);
};

/** Hard auth for signed-in-only features (GitHub export, etc.). */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!jwtCheck) {
    res.status(501).json({
      error: 'Auth0 is not configured on the server (set AUTH0_DOMAIN and AUTH0_AUDIENCE).',
    });
    return;
  }
  return jwtCheck(req, res, next);
};
