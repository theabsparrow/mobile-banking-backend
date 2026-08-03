/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import mongoose from "mongoose";

import { StatusCodes } from "http-status-codes";
import type { TErrorSource, TValidationError } from "../interface/error.js";

const handleCastError = (err: mongoose.Error.CastError): TValidationError => {
  const errorSource: TErrorSource = [
    {
      path: err?.path,
      message: err?.message,
    },
  ];
  const statusCode: number = StatusCodes.BAD_REQUEST;
  const message = "Invalid ID";
  return {
    statusCode,
    message,
    errorSource,
  };
};
export default handleCastError;