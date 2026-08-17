import { RequestStatus, Role, type TransactionType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { getIO } from '../../socket/server.js';
import { invalidateAuthUserCache} from '../auth/auth.utills.js';
import type { TProcessRequestInput, TCreateRequest, TRequest } from './request.interface.js';
import { verifyUserPin } from '../../utills/verifyPin.js';
import type { TQuery } from '../user/user.interface.js';

// cretae business request
const createBusinessRequest = async (id: string, payload: TCreateRequest) => {
  const { amount, reason, pin } = payload;
  const isPinVerified = await verifyUserPin(id, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }
  const request = await prisma.request.create({
    data: {
      requesterId: id,
      amount,
      reason,
    },
  });
  return request;
};

// create personal request
const createPersonalRequest = async (id: string, payload: TCreateRequest) => {
  const { amount, reason, pin, receiverId } = payload;
  if (id === receiverId) {
    throw new AppError(StatusCodes.CONFLICT, 'you can`t req to yourself');
  }
  const isPinVerified = await verifyUserPin(id, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }
  const request = await prisma.request.create({
    data: {
      requesterId: id,
      receiverId: receiverId as string,
      amount,
      reason,
    },
  });
  return request;
};

// get requests
const getRequests = async (userId: string, role: Role, query: TQuery) => {
  let requests;
  if (role === Role.SUPER_ADMIN) {
    requests = prisma.request.findMany();
  } else {
    requests = prisma.request.findMany({
      where: {
        OR: [
          {
            status: RequestStatus.PENDING,
          },
          {
            status: RequestStatus.CANCELLED,
          },
          {
            processedById: userId,
          },
          {
            receiverId: userId,
          },
        ],
      },
    });
  }
  return requests;
};

// get my requests
const getMyRequests = async (userId: string) => {
  const requests = await prisma.request.findMany({
    where: {
      OR: [{ requesterId: userId }, { receiverId: userId }],
    },

    orderBy: { createdAt: 'desc' },
  });
  return requests;
};

// get requests by id
const getRequestById = async (userId: string, role: Role, id: string) => {
  const request = await prisma.request.findUnique({
    where: {
      id,
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  // Super Admin can see any request
  if (role === Role.SUPER_ADMIN) {
    return request;
  }

  // Admin access
  const userAccess =
    request.requesterId === userId ||
    request.receiverId === userId ||
    request.processedById === userId;

  const hasAccess =
    role === Role.ADMIN
      ? userAccess ||
        request.status === RequestStatus.PENDING ||
        request.status === RequestStatus.CANCELLED
      : userAccess;
  if (!hasAccess) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Access denied.');
  }
  return request;
};

// cancell request
const cancelRequest = async (userId: string, id: string, payload: TRequest) => {
  const { pin } = payload;

  // 1. Verify PIN
  await verifyUserPin(userId, pin);

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be cancelled.');
  }

  if (request.requesterId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only the requester can cancel this request.');
  }

  const result = await prisma.request.update({
    where: { id },
    data: {
      status: 'CANCELLED',
    },
  });

  return result;
};

// delete request
const deleteRequest = async (userId: string, id: string, payload: TRequest) => {
  const { pin } = payload;

  // 1. Verify PIN
  await verifyUserPin(userId, pin);

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.requesterId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only the requester can delete this request.');
  }

  await prisma.request.delete({
    where: { id },
  });
  return null;
};

const rejectRequest = async (userId: string, id: string, payload: TRequest) => {
  const { pin, rejectionReason } = payload;
  // 1. Verify PIN
  const isPinVerified = await verifyUserPin(userId, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id },
    select: {
      receiverId: true,
      status: true,
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be rejected.');
  }

  if (request?.receiverId && request?.receiverId !== userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'You can`t reject this request');
  }

  const updatedRequest = await prisma.request.update({
    where: { id },
    data: {
      status: 'REJECTED',
      processedById: userId,
      processedAt: new Date(),
      rejectionReason: rejectionReason ?? null,
    },
  });
  return updatedRequest;
};

const approveRequest = async (userId: string, requestId: string, payload: TProcessRequestInput) => {
  const { pin, adminNote } = payload;

  // 1. Verify PIN
  const isPinVerified = await verifyUserPin(userId, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }

  const approver = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: { select: { name: true } },
    },
  });

  if (!approver) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Approver user not found.');
  }

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      requester: {
        select: {
          id: true,
          role: true,
          phone: true,
          profile: { select: { name: true } },
        },
      },
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be approved.');
  }

  const isAdmin = approver.role === Role.ADMIN || approver.role === Role.SUPER_ADMIN;

  // Enforce receiver or admin permission
  if (request.receiverId !== userId && !isAdmin) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You do not have permission to approve this request.'
    );
  }

  const amount = Number(request.amount);

  // 3. Determine transaction type based on roles
  let transactionType: TransactionType = 'SEND_MONEY';
  if (approver.role === Role.ADMIN || approver.role === Role.SUPER_ADMIN) {
    transactionType = 'CASH_IN';
  } else if (approver.role === Role.AGENT) {
    if (request.requester.role === Role.AGENT) {
      transactionType = 'SEND_MONEY';
    } else {
      transactionType = 'CASH_IN';
    }
  } else if (approver.role === Role.CUSTOMER) {
    if (request.requester.role === Role.AGENT) {
      transactionType = 'CASH_OUT';
    } else {
      transactionType = 'SEND_MONEY';
    }
  }

  // 4. Perform atomic transfer inside transaction
  const result = await prisma.$transaction(async (tx) => {
    // Sender of money is Approver (userId)
    // Receiver of money is Requester (request.requesterId)
    const senderWallet = await getOrCreateWallet(userId, tx);
    const receiverWallet = await getOrCreateWallet(request.requesterId, tx);

    if (Number(senderWallet.balance) < amount) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient balance to approve request.');
    }

    // Deduct sender wallet & user balance
    await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { balance: { decrement: amount } },
    });

    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    // Credit receiver wallet & user balance
    const updatedReceiverWallet = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: request.requesterId },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-REQ-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: transactionType,
        status: 'COMPLETED',
        amount,
        totalAmount: amount,
        senderWalletId: senderWallet.id,
        receiverWalletId: receiverWallet.id,
        initiatedById: userId,
        description: adminNote || 'Approved money request',
      },
    });

    // Create ledgers
    await tx.walletLedger.create({
      data: {
        walletId: senderWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount,
        balanceBefore: senderWallet.balance,
        balanceAfter: Number(senderWallet.balance) - amount,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: receiverWallet.id,
        transactionId: transaction.id,
        type: 'CREDIT',
        amount,
        balanceBefore: receiverWallet.balance,
        balanceAfter: Number(receiverWallet.balance) + amount,
      },
    });

    // Update request
    const updatedRequest = await tx.request.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        processedById: userId,
        processedAt: new Date(),
        adminNote: adminNote ?? null,
        transactionId: transaction.id,
      },
    });

    return {
      request: updatedRequest,
      transaction,
      receiverBalance: Number(updatedReceiverWallet.balance),
    };
  });

  // 5. Invalidate caches
  await invalidateAuthUserCache(userId);
  await invalidateAuthUserCache(request.requesterId);

  // 6. Notify requester in real-time
  const io = getIO();
  io.to(request.requesterId).emit('money-request-approved', result.request);
  io.to(request.requesterId).emit('balance-updated', { balance: result.receiverBalance });
  io.to(request.requesterId).emit('notification', {
    message: `Your money request for BDT ${amount} has been approved by ${approver.profile?.name || approver.phone}.`,
  });

  return result;
};

export const requestService = {
  createBusinessRequest,
  createPersonalRequest,
  getRequests,
  getMyRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
  rejectRequest,
  approveRequest,
};
