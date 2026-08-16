export type TCreateRequest = {
  receiverId?: string;
  amount: number;
  reason: string;
  pin: string;
};

export type TRequest = {
  pin: string;
  rejectionReason: string;
};

export type TProcessRequestInput = {
  pin: string;
  adminNote?: string;
};
