/* eslint-disable @typescript-eslint/no-unused-vars */
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
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
