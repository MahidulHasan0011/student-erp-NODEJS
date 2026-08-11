import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { authRepository, type AuthSafeUserRow, type AuthUserRow } from './auth.repository.js';
import { AppError } from '../../utils/appError.js';
import { env } from '../../config/env.js';
import redisClient, { TTL } from '../../config/redis.js';
import type {
  AccessTokenPayload,
  DecodedRefreshToken,
  RefreshTokenPayload,
} from '../../types/auth.types.js';

/** The logged-in user as returned to the client — every column except the hash. */
export type SafeUser = Omit<AuthUserRow, 'password'>;

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_KEY = (userId: string): string => `refresh_token:${userId}`;

// The expiry comes from env as a plain string ('15m'), but jsonwebtoken types expiresIn as a
// narrow template-literal type, so it is asserted to the option's own type rather than widened.
const accessExpires = env.JWT_ACCESS_EXPIRES as SignOptions['expiresIn'];
const refreshExpires = env.JWT_REFRESH_EXPIRES as SignOptions['expiresIn'];

const signAccess = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: accessExpires });

const signRefresh = (payload: RefreshTokenPayload): string =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: refreshExpires });

export const authService = {
  async login({ email, password }: LoginInput): Promise<LoginResult> {
    // type guard — a garbage payload (object/number) yields a clean 401 instead of crashing .toLowerCase()/bcrypt
    // it's safer not to distinguish valid-but-wrong from garbage (reduces user enumeration)
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      throw new AppError('Invalid email or password', 401);
    }

    const user = await authRepository.findByEmail(email.toLowerCase());
    if (!user) throw new AppError('Invalid email or password', 401);
    if (!user.is_active) throw new AppError('Account is deactivated', 403);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new AppError('Invalid email or password', 401);

    const tokenPayload = { userId: user.id, roleId: user.role_id, roleName: user.role_name };
    const accessToken = signAccess(tokenPayload);
    const refreshToken = signRefresh({ userId: user.id });

    await redisClient.setEx(REFRESH_KEY(user.id), TTL.REFRESH_TOKEN, refreshToken);

    const { password: _pw, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  },

  async refresh(refreshToken: string): Promise<RefreshResult> {
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new AppError('Refresh token required', 401);
    }

    let decoded: DecodedRefreshToken;
    try {
      // verify() is typed `string | JwtPayload`; signRefresh only ever signs an object
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as DecodedRefreshToken;
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const stored = await redisClient.get(REFRESH_KEY(decoded.userId));

    // if the stored token is missing or doesn't match — suspect token reuse/theft, invalidate the whole session
    if (!stored || stored !== refreshToken) {
      await redisClient.del(REFRESH_KEY(decoded.userId)); // safety: delete any token that may still be present
      throw new AppError('Refresh token is no longer valid — please log in again', 401);
    }

    const user = await authRepository.findById(decoded.userId);
    if (!user || !user.is_active) throw new AppError('User not found or deactivated', 401);

    const tokenPayload = { userId: user.id, roleId: user.role_id, roleName: user.role_name };

    // ── Rotation: new access + new refresh token, old refresh token invalidated ──
    const accessToken = signAccess(tokenPayload);
    const newRefreshToken = signRefresh({ userId: user.id });

    await redisClient.setEx(REFRESH_KEY(user.id), TTL.REFRESH_TOKEN, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  },

  async logout(userId: string): Promise<void> {
    await redisClient.del(REFRESH_KEY(userId));
  },

  async getMe(userId: string): Promise<AuthSafeUserRow> {
    const user = await authRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  },
};
