import { Role } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { getIO } from '../../socket/server.js';
import { compareData } from '../../utills/hashData.js';
import { invalidateAuthUserCache } from '../auth/auth.utills.js';
import type { TSendMoneyInput, TCashOutInput } from './transaction.interface.js';

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

const sendMoney = async (senderId: string, payload: TSendMoneyInput) => {
  const { receiverPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN
  const sender = await verifyUserPin(senderId, pin);

  if (sender.role !== Role.CUSTOMER) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only customers can send money.');
  }

  // 2. Find Receiver (Customer)
  const receiver = await prisma.user.findFirst({
    where: {
      OR: [
        { email: receiverPhoneOrEmail },
        { phone: receiverPhoneOrEmail },
      ],
      role: Role.CUSTOMER,
      status: 'ACTIVE',
    },
  });

  if (!receiver) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Receiver customer not found or is inactive.');
  }

  if (senderId === receiver.id) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot send money to yourself.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const senderWallet = await getOrCreateWallet(senderId, tx);
    const receiverWallet = await getOrCreateWallet(receiver.id, tx);

    if (Number(senderWallet.balance) < amount) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient balance.');
    }

    // Deduct sender
    const updatedSenderWallet = await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { balance: { decrement: amount } },
    });

    await tx.user.update({
      where: { id: senderId },
      data: { balance: { decrement: amount } },
    });

    // Credit receiver
    const updatedReceiverWallet = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: receiver.id },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-SM-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: 'USER_TO_USER',
        status: 'COMPLETED',
        amount,
        totalAmount: amount,
        senderWalletId: senderWallet.id,
        receiverWalletId: receiverWallet.id,
        initiatedById: senderId,
        description: `Send money to ${receiver.name || receiver.email}`,
      },
    });

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

    return {
      transaction,
      senderBalance: Number(updatedSenderWallet.balance),
      receiverBalance: Number(updatedReceiverWallet.balance),
    };
  });

  await invalidateAuthUserCache(senderId);
  await invalidateAuthUserCache(receiver.id);

  // Notify receiver and update balances
  const io = getIO();
  io.to(receiver.id).emit('balance-updated', { balance: result.receiverBalance });
  io.to(receiver.id).emit('notification', {
    message: `You received BDT ${amount} from ${sender.name || sender.phone || sender.email}.`,
  });

  return result;
};

const cashInToUser = async (agentId: string, payload: TSendMoneyInput) => {
  const { receiverPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN
  const agent = await verifyUserPin(agentId, pin);

  if (agent.role !== Role.AGENT) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only agents can perform cash in.');
  }

  // 2. Find Receiver (Customer)
  const receiver = await prisma.user.findFirst({
    where: {
      OR: [
        { email: receiverPhoneOrEmail },
        { phone: receiverPhoneOrEmail },
      ],
      role: Role.CUSTOMER,
      status: 'ACTIVE',
    },
  });

  if (!receiver) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Receiver customer not found or is inactive.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const agentWallet = await getOrCreateWallet(agentId, tx);
    const receiverWallet = await getOrCreateWallet(receiver.id, tx);

    if (Number(agentWallet.balance) < amount) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient balance.');
    }

    // Deduct agent
    const updatedAgentWallet = await tx.wallet.update({
      where: { id: agentWallet.id },
      data: { balance: { decrement: amount } },
    });

    await tx.user.update({
      where: { id: agentId },
      data: { balance: { decrement: amount } },
    });

    // Credit receiver
    const updatedReceiverWallet = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: receiver.id },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-CI-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: 'AGENT_TO_USER',
        status: 'COMPLETED',
        amount,
        totalAmount: amount,
        senderWalletId: agentWallet.id,
        receiverWalletId: receiverWallet.id,
        initiatedById: agentId,
        description: `Cash in to ${receiver.name || receiver.email}`,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: agentWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount,
        balanceBefore: agentWallet.balance,
        balanceAfter: Number(agentWallet.balance) - amount,
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

    return {
      transaction,
      agentBalance: Number(updatedAgentWallet.balance),
      receiverBalance: Number(updatedReceiverWallet.balance),
    };
  });

  await invalidateAuthUserCache(agentId);
  await invalidateAuthUserCache(receiver.id);

  // Notify receiver and update balances
  const io = getIO();
  io.to(receiver.id).emit('balance-updated', { balance: result.receiverBalance });
  io.to(receiver.id).emit('notification', {
    message: `Your account has been cashed in BDT ${amount} by agent ${agent.name || agent.phone}.`,
  });

  return result;
};

const cashOut = async (userId: string, payload: TCashOutInput) => {
  const { agentPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN
  const user = await verifyUserPin(userId, pin);

  if (user.role !== Role.CUSTOMER) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only customers can perform cash out.');
  }

  // 2. Find Agent
  const agent = await prisma.user.findFirst({
    where: {
      OR: [
        { email: agentPhoneOrEmail },
        { phone: agentPhoneOrEmail },
      ],
      role: Role.AGENT,
      status: 'ACTIVE',
    },
  });

  if (!agent) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Agent not found or is inactive.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const userWallet = await getOrCreateWallet(userId, tx);
    const agentWallet = await getOrCreateWallet(agent.id, tx);

    if (Number(userWallet.balance) < amount) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient balance.');
    }

    // Deduct user
    const updatedUserWallet = await tx.wallet.update({
      where: { id: userWallet.id },
      data: { balance: { decrement: amount } },
    });

    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    // Credit agent
    const updatedAgentWallet = await tx.wallet.update({
      where: { id: agent.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: agent.id },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-CO-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: 'CASH_OUT',
        status: 'COMPLETED',
        amount,
        totalAmount: amount,
        senderWalletId: userWallet.id,
        receiverWalletId: agentWallet.id,
        initiatedById: userId,
        description: `Cash out to agent ${agent.name || agent.email}`,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: userWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount,
        balanceBefore: userWallet.balance,
        balanceAfter: Number(userWallet.balance) - amount,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: agentWallet.id,
        transactionId: transaction.id,
        type: 'CREDIT',
        amount,
        balanceBefore: agentWallet.balance,
        balanceAfter: Number(agentWallet.balance) + amount,
      },
    });

    return {
      transaction,
      userBalance: Number(updatedUserWallet.balance),
      agentBalance: Number(updatedAgentWallet.balance),
    };
  });

  await invalidateAuthUserCache(userId);
  await invalidateAuthUserCache(agent.id);

  // Notify agent and update balances
  const io = getIO();
  io.to(agent.id).emit('balance-updated', { balance: result.agentBalance });
  io.to(agent.id).emit('notification', {
    message: `Received cash out of BDT ${amount} from customer ${user.name || user.phone}.`,
  });

  return result;
};

export const transactionService = {
  sendMoney,
  cashInToUser,
  cashOut,
};
