/* eslint-disable @typescript-eslint/no-unused-vars */
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import config from './config/index.js';
import cors from 'cors';
import { mainrouter } from './router/index.js';

export const app: Application = express();
app.use(express.json());
app.use(cookieParser());

const corsOption = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    config.client_url as string,
  ],
  credentials: true,
};

app.use(cors(corsOption));
app.use('/api/v1', mainrouter);

const test = (req: Request, res: Response, next: NextFunction) => {
  const message = `server is running on port ${config.port as string}`;
  res.send(message);
};

app.get('/', test);

interface TError extends Error {
  statusCode?: number;
}

// Global Error Handler
app.use((err: TError, req: Request, res: Response, next: NextFunction) => {
  let statusCode = err.statusCode || 400; // default to 400 for bad request client errors
  let message = err.message || 'Something went wrong';
  let errorSources: { path: string; message: string }[] | null = null;

  if (err instanceof ZodError) {
    statusCode = 400;
    message = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    errorSources = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// Not Found Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'API Route Not Found',
  });
});
