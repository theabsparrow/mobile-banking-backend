import { Role, type TransactionType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { getIO } from '../../socket/server.js';
import { invalidateAuthUserCache } from '../auth/auth.utills.js';
import type { TProcessRequestInput, TCreateRequest, TRequest } from './request.interface.js';
import { verifyUserPin } from '../../utills/verifyPin.js';

interface IPrismaTx {
  wallet: typeof prisma.wallet;
}

// Helper to ensure a wallet exists for the user
const getOrCreateWallet = async (userId: string, tx: IPrismaTx = prisma) => {
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

const requestUserSelect = {
  id: true,
  email: true,
  phone: true,
  role: true,
  profile: {
    select: {
      name: true,
    },
  },
};

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
const getRequests = async (userId: string, role: Role) => {
  let requests;
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
    requests = await prisma.request.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { receiverId: userId },
          { status: 'PENDING' },
          { processedById: userId },
        ],
      },
      include: {
        requester: { select: requestUserSelect },
        receiver: { select: requestUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  } else {
    requests = await prisma.request.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      include: {
        requester: { select: requestUserSelect },
        receiver: { select: requestUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  return requests.map(mapRequest);
};

const getMyRequests = async (userId: string) => {
  let requests;
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
    requests = await prisma.request.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { receiverId: userId },
          { status: 'PENDING' },
          { processedById: userId },
        ],
      },
      include: {
        requester: { select: requestUserSelect },
        receiver: { select: requestUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  } else {
    requests = await prisma.request.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      include: {
        requester: { select: requestUserSelect },
        receiver: { select: requestUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  return requests.map(mapRequest);
};

const getRequestById = async (userId: string, requestId: string) => {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      requester: { select: requestUserSelect },
      receiver: { select: requestUserSelect },
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  // Agents and Customers can only see requests they are involved in
  if (
    role !== Role.ADMIN &&
    role !== Role.SUPER_ADMIN &&
    request.requesterId !== userId &&
    request.receiverId !== userId
  ) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Access denied.');
  }

  // Admins can only see pending requests or requests they processed
  if (
    (role === Role.ADMIN || role === Role.SUPER_ADMIN) &&
    request.requesterId !== userId &&
    request.receiverId !== userId &&
    request.status !== 'PENDING' &&
    request.processedById !== userId
  ) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Access denied.');
  }

  return request;
};

const cancelRequest = async (userId: string, requestId: string, payload: TRequest) => {
  const { pin } = payload;

  // 1. Verify PIN
  await verifyUserPin(userId, pin);

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.requesterId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only the requester can cancel this request.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be cancelled.');
  }

  const updatedRequest = await prisma.request.update({
    where: { id: requestId },
    data: {
      status: 'CANCELLED',
    },
  });

  return updatedRequest;
};

const deleteRequest = async (userId: string, requestId: string, payload: TRequest) => {
  const { pin } = payload;

  // 1. Verify PIN
  await verifyUserPin(userId, pin);

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.requesterId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only the requester can delete this request.');
  }

  await prisma.request.delete({
    where: { id: requestId },
  });

  return null;
};

const rejectRequest = async (userId: string, requestId: string, payload: TRequest) => {
  const { pin, rejectionReason } = payload;

  // 1. Verify PIN
  await verifyUserPin(userId, pin);

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      receiver: { select: { role: true } },
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be rejected.');
  }

  // Admins can reject business requests; Receivers can reject personal requests
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isAdmin = user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;

  if (request.receiverId !== userId && !isAdmin) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You do not have permission to reject this request.');
  }

  const updatedRequest = await prisma.request.update({
    where: { id: requestId },
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
  const approver = await verifyUserPin(userId, pin);

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
