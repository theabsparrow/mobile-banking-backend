/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { redisClient } from '../../redis/redis.client.js';
import type { IWalletResponse } from './wallet.interface.js';
import { getWalletCacheKey, WALLET_CACHE_TTL } from './wallet.utills.js';

// Helper to get wallet for the user
export const getUserWallet = async (userId: string, tx: any = prisma) => {
  const wallet = await tx.wallet.findUnique({
    where: { userId },
  });
  if (!wallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Wallet not found for this user.');
  }
  return wallet;
};

// Backward-compatible alias
export const getOrCreateWallet = getUserWallet;

// Get wallet for a user with Redis caching
const getMyWallet = async (userId: string): Promise<IWalletResponse> => {
  const cacheKey = getWalletCacheKey(userId);

  // 1. Try reading from Redis cache
  if (redisClient.isOpen) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as IWalletResponse;
      }
    } catch (err) {
      console.error('Redis get error for wallet:', err);
    }
  }

  // 2. Fetch user and wallet from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      profile: {
        select: {
          name: true,
          image: true,
          address: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const wallet = await getUserWallet(userId);

  const walletData: IWalletResponse = {
    id: wallet.id,
    userId: wallet.userId,
    balance: Number(wallet.balance),
    currency: wallet.currency,
    status: wallet.status,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    user,
  };

  // 3. Store in Redis
  if (redisClient.isOpen) {
    try {
      await redisClient.set(cacheKey, JSON.stringify(walletData), {
        EX: WALLET_CACHE_TTL,
      });
    } catch (err) {
      console.error('Redis set error for wallet:', err);
    }
  }

  return walletData;
};

const getWalletByUserId = async (targetUserId: string): Promise<IWalletResponse> => {
  return getMyWallet(targetUserId);
};

export const walletService = {
  getMyWallet,
  getWalletByUserId,
  getUserWallet,
  getOrCreateWallet,
};
