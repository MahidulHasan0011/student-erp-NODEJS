// ─────────────────────────────────────────────────────────────────────────────
// JWT payload shapes — mirrors what src/modules/auth/auth.service.js signs.
//
// The two tokens do NOT carry the same claims, and that matters: the refresh
// token holds only userId, so nothing downstream may assume a role is present on
// it. Modelling them as one type would let a refresh payload leak into a place
// that reads `roleId` and get `undefined` at runtime.
// ─────────────────────────────────────────────────────────────────────────────

/** Claims signed into the ACCESS token, and what authMiddleware puts on req.user. */
export interface AccessTokenPayload {
  userId: string;
  /** nullable in the DB (users.role_id), so it can legitimately be null here */
  roleId: string | null;
  /** joined from roles.name at login, e.g. 'ADMIN' */
  roleName: string | null;
}

/** Claims signed into the REFRESH token — userId only. */
export interface RefreshTokenPayload {
  userId: string;
}

/**
 * Registered claims jsonwebtoken adds on top of the payload.
 * `jwt.verify` returns these too, so a decoded access token is really
 * AccessTokenPayload & JwtRegisteredClaims.
 */
export interface JwtRegisteredClaims {
  /** issued at, seconds since epoch */
  iat: number;
  /** expires at, seconds since epoch */
  exp: number;
}

export type DecodedAccessToken = AccessTokenPayload & JwtRegisteredClaims;
export type DecodedRefreshToken = RefreshTokenPayload & JwtRegisteredClaims;
