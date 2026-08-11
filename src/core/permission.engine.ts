import { roleRepository } from '../modules/roles/role.repository.js';
import { cacheService } from '../services/cache.service.js';
import { TTL } from '../config/redis.js';

const PERM_CACHE_KEY = (roleId: string): string => `role_permissions:${roleId}`;

// ── Core business logic — resolve a list of permission names from a roleId ──
// Used by rbac.middleware.js and role.service.js.
// cache-first: if present in Redis it doesn't touch the DB; otherwise it fetches from the DB and caches it
export const permissionEngine = {
  async resolvePermissions(roleId: string): Promise<string[]> {
    const cached = await cacheService.get<string[]>(PERM_CACHE_KEY(roleId));
    if (cached) return cached;

    const permissions: string[] = await roleRepository.getPermissionNames(roleId);
    await cacheService.set(PERM_CACHE_KEY(roleId), permissions, TTL.PERMISSIONS);
    return permissions;
  },

  async invalidate(roleId: string): Promise<void> {
    await cacheService.del(PERM_CACHE_KEY(roleId));
  },

  // Invalidate the cache for multiple roles at once (after a bulk permission update)
  async invalidateMany(roleIds: string[]): Promise<void> {
    await Promise.all(roleIds.map((id) => this.invalidate(id)));
  },
};
