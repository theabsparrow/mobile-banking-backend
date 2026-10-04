import { redisClient } from '../../redis/redis.client.js';

export const WALLET_CACHE_PREFIX = 'wallet:user:';
export const WALLET_CACHE_TTL = 3600; // 1 hour

export const getWalletCacheKey = (userId: string) => `${WALLET_CACHE_PREFIX}${userId}`;

export const invalidateWalletCache = async (userId: string) => {
  try {
    if (redisClient.isOpen) {
      await redisClient.del(getWalletCacheKey(userId));
    }
  } catch (err) {
    console.error(`Failed to invalidate wallet cache for user ${userId}:`, err);
  }
};
