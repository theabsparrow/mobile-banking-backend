/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { redisClient } from '../../redis/redis.client.js';
import { getIO } from '../../socket/server.js';
import { invalidateAuthUserCache } from '../auth/auth.utills.js';
import { invalidateWalletCache } from '../wallet/wallet.utills.js';

export const FEE_CONFIG_CACHE_KEY = 'system:fee-config';
export const FEE_CONFIG_CACHE_TTL = 24 * 60 * 60; // 24 hours

export interface ITransactionFeeConfig {
  id: string;
  sendMoneyFeePerThousand: number;
  cashOutFeePerThousand: number;
  cashInCommissionPerThousand: number;
  cashOutCommissionPerThousand: number;
  updatedById?: string | null;
  updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// 1. Dynamic Fee & Commission Configuration (Cached in Redis)
// ---------------------------------------------------------------------------
export const getTransactionFeeConfig = async (): Promise<ITransactionFeeConfig> => {
  // Try Redis cache first
  if (redisClient.isOpen) {
    try {
      const cached = await redisClient.get(FEE_CONFIG_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as ITransactionFeeConfig;
      }
    } catch (err) {
      console.error('Redis error reading fee config:', err);
    }
  }

  // Fetch from database
  let config = await prisma.transactionFeeConfig.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!config) {
    config = await prisma.transactionFeeConfig.create({
      data: {
        sendMoneyFeePerThousand: 5.0,
        cashOutFeePerThousand: 15.0,
        cashInCommissionPerThousand: 4.14,
        cashOutCommissionPerThousand: 0.0,
      },
    });
  }

  const result: ITransactionFeeConfig = {
    id: config.id,
    sendMoneyFeePerThousand: Number(config.sendMoneyFeePerThousand),
    cashOutFeePerThousand: Number(config.cashOutFeePerThousand),
    cashInCommissionPerThousand: Number(config.cashInCommissionPerThousand),
    cashOutCommissionPerThousand: Number(config.cashOutCommissionPerThousand),
    updatedById: config.updatedById,
    updatedAt: config.updatedAt,
  };

  if (redisClient.isOpen) {
    try {
      await redisClient.set(FEE_CONFIG_CACHE_KEY, JSON.stringify(result), {
        EX: FEE_CONFIG_CACHE_TTL,
      });
    } catch (err) {
      console.error('Redis error caching fee config:', err);
    }
  }

  return result;
};

export const invalidateFeeConfigCache = async () => {
  try {
    if (redisClient.isOpen) {
      await redisClient.del(FEE_CONFIG_CACHE_KEY);
    }
  } catch (err) {
    console.error('Redis error deleting fee config:', err);
  }
};

// ---------------------------------------------------------------------------
// 2. Fee & Commission Calculations
// ---------------------------------------------------------------------------
export const calculateSendMoneyFee = (amount: number, feePerThousand: number): number => {
  return Number(((amount / 1000) * feePerThousand).toFixed(2));
};

export const calculateCashOutFee = (amount: number, feePerThousand: number): number => {
  return Number(((amount / 1000) * feePerThousand).toFixed(2));
};

export const calculateCashInCommission = (amount: number, commissionPerThousand: number): number => {
  return Number(((amount / 1000) * commissionPerThousand).toFixed(2));
};

// ---------------------------------------------------------------------------
// 3. User Wallet Retrieval
// ---------------------------------------------------------------------------
export const getUserWallet = async (userId: string, tx: any = prisma) => {
  const wallet = await tx.wallet.findUnique({
    where: { userId },
  });
  if (!wallet) {
    throw new AppError(StatusCodes.NOT_FOUND, `Wallet not found for user ${userId}.`);
  }
  return wallet;
};

// Maintained for backward compatibility (e.g. with request.service.ts)
export const getOrCreateWallet = async (userId: string, tx: any = prisma) => {
  let wallet = await tx.wallet.findUnique({
    where: { userId },
  });
  if (!wallet) {
    wallet = await tx.wallet.create({
      data: {
        userId,
        balance: 0.0,
      },
    });
  }
  return wallet;
};

// ---------------------------------------------------------------------------
// 4. Safe Socket.IO Emitter
// ---------------------------------------------------------------------------
export const safeEmit = (fn: (io: any) => void) => {
  try {
    const io = getIO();
    if (io) {
      fn(io);
    }
  } catch {
    // Socket.IO not initialized (e.g. in test or worker environments)
  }
};

// ---------------------------------------------------------------------------
// 5. Cache Invalidation Helper
// ---------------------------------------------------------------------------
export const invalidateCaches = async (...userIds: string[]) => {
  await Promise.all(
    userIds.map(async (id) => {
      try {
        await invalidateAuthUserCache(id);
        await invalidateWalletCache(id);
      } catch (err) {
        console.error(`Cache invalidation error for user ${id}:`, err);
      }
    })
  );
};

// ---------------------------------------------------------------------------
// 6. Date Filter Builder
// ---------------------------------------------------------------------------
export const buildDateFilter = (query: { date?: unknown; startDate?: unknown; endDate?: unknown }) => {
  if (query.date && typeof query.date === 'string') {
    const start = new Date(query.date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(query.date);
    end.setUTCHours(23, 59, 59, 999);
    return { gte: start, lte: end };
  }

  const dateFilter: Record<string, Date> = {};
  if (query.startDate && typeof query.startDate === 'string') {
    const start = new Date(query.startDate);
    start.setUTCHours(0, 0, 0, 0);
    dateFilter.gte = start;
  }
  if (query.endDate && typeof query.endDate === 'string') {
    const end = new Date(query.endDate);
    end.setUTCHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }

  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
};
