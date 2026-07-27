export type TMeta = {
  limit: number;
  page: number;
  total: number;
  totalPage: number;
};

export type TSendResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  meta: TMeta;
  data?: T;
};
