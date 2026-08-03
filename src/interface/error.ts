export type TErrorSource = {
  path: string | number;
  message: string;
}[];

export type TValidationError = {
  message: string;
  statusCode: number;
  errorSource: TErrorSource;
};