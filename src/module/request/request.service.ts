import { Role, type TransactionType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { getIO } from '../../socket/server.js';
import { compareData } from '../../utills/hashData.js';
import { invalidateAuthUserCache } from '../auth/auth.utills.js';
import type {
  TCreateBusinessRequestInput,
  TCreatePersonalRequestInput,
  TCancelRequestInput,
  TDeleteRequestInput,
  TRejectRequestInput,
  TProcessRequestInput,
} from './request.interface.js';

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

// Helper to verify PIN
const verifyUserPin = async (userId: string, pin: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user || !user.pin) {
    throw new AppError(StatusCodes.FORBIDDEN, 'User PIN is not set.');
  }
  const isPinMatched = await compareData(pin, user.pin);
  if (!isPinMatched) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
  }
  return user;
};

const createBusinessRequest = async (id: string, payload: TCreateBusinessRequestInput) => {
  const { amount, reason, pin } = payload;

  // 1. Verify PIN
  await verifyUserPin(id, pin);

  // 2. Verify Requester is Agent
  const requester = await prisma.user.findUnique({
    where: {id},
  });

  if (!requester || requester.role !== Role.AGENT) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only agents can request business funds.');
  }

  // 3. Find Admin
  const admin = await prisma.user.findFirst({
    where: {
      role: {
        in: [Role.ADMIN, Role.SUPER_ADMIN],
      },
      status: 'ACTIVE',
    },
  });

  if (!admin) {
    throw new AppError(StatusCodes.NOT_FOUND, 'No admin found to receive this request.');
  }

  const request = await prisma.request.create({
    data: {
      requesterId: id,
      receiverId: admin.id,
      amount,
      reason,
      status: 'PENDING',
    },
    include: {
      requester: { select: { id: true, name: true, email: true, phone: true } },
      receiver: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  // Emit event to all admins
  const io = getIO();
  io.emit('new-money-request', request);

  return request;
};

const createPersonalRequest = async (id: string, payload: TCreatePersonalRequestInput) => {
  const { receiverId, amount, reason, pin } = payload;

  // 1. Verify PIN
  await verifyUserPin(id, pin);

  if (id === receiverId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot request money from yourself.');
  }

  // 2. Validate Receiver exists and is active customer/agent
  const receiver = await prisma.user.findUnique({
    where: { id },
  });

  if (!receiver || receiver.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.NOT_FOUND, 'Receiver user not found or is inactive.');
  }

  // 3. Validate Receiver is in Requester's contact list
  const inContactList = await prisma.userContact.findUnique({
    where: {
      ownerId_savedUserId: {
        ownerId: id,
        savedUserId: receiverId,
      },
    },
  });

  if (!inContactList) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You can only request money from users in your contact list.');
  }

  const request = await prisma.request.create({
    data: {
      requesterId: id,
      receiverId,
      amount,
      reason,
      status: 'PENDING',
    },
    include: {
      requester: { select: { id: true, name: true, email: true, phone: true } },
      receiver: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  // Emit event to receiver in real-time
  const io = getIO();
  io.to(receiverId).emit('new-personal-request', request);

  return request;
};

const getRequests = async (userId: string, role: Role) => {
  let request;
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
    request = await prisma.request.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { receiverId: userId },
          { status: 'PENDING' },
          { processedById: userId },
        ],
      },
      include: {
        requester: { select: { id: true, name: true, email: true, phone: true } },
        receiver: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  } else {
    request = await prisma.request.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        requester: { select: { id: true, name: true, email: true, phone: true } },
        receiver: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  return request;
};

const getRequestById = async (userId: string, role: Role, requestId: string) => {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      requester: { select: { id: true, name: true, email: true, phone: true } },
      receiver: { select: { id: true, name: true, email: true, phone: true } },
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

const cancelRequest = async (userId: string, requestId: string, payload: TCancelRequestInput) => {
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

  // Emit event in real-time
  const io = getIO();
  io.to(request.receiverId).emit('money-request-cancelled', { id: requestId });

  return updatedRequest;
};

const deleteRequest = async (userId: string, requestId: string, payload: TDeleteRequestInput) => {
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

const rejectRequest = async (userId: string, requestId: string, payload: TRejectRequestInput) => {
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

  // Notify requester in real-time
  const io = getIO();
  io.to(request.requesterId).emit('money-request-rejected', updatedRequest);

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
      requester: { select: { id: true, role: true, name: true, phone: true } },
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
    throw new AppError(StatusCodes.FORBIDDEN, 'You do not have permission to approve this request.');
  }

  const amount = Number(request.amount);

  // 3. Determine transaction type based on roles
  let transactionType: TransactionType = 'USER_TO_USER';
  if (approver.role === Role.ADMIN || approver.role === Role.SUPER_ADMIN) {
    transactionType = 'ADMIN_TO_AGENT';
  } else if (approver.role === Role.AGENT) {
    if (request.requester.role === Role.AGENT) {
      transactionType = 'AGENT_TO_AGENT';
    } else {
      transactionType = 'AGENT_TO_USER';
    }
  } else if (approver.role === Role.CUSTOMER) {
    if (request.requester.role === Role.AGENT) {
      transactionType = 'USER_TO_AGENT';
    } else {
      transactionType = 'USER_TO_USER';
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
    message: `Your money request for BDT ${amount} has been approved by ${approver.name || approver.phone}.`,
  });

  return result;
};

export const requestService = {
  createBusinessRequest,
  createPersonalRequest,
  getRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
  rejectRequest,
  approveRequest,
};
