export type TSendMoneyInput = {
  receiverPhoneOrEmail: string;
  amount: number;
  pin: string;
};

export type TCashOutInput = {
  agentPhoneOrEmail: string;
  amount: number;
  pin: string;
};
