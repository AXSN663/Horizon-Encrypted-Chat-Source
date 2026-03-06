import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { authRouter } from './routes/auth';
import { roomRouter } from './routes/rooms';
import { messageRouter } from './routes/messages';
import { fileRouter } from './routes/files';
import { friendsRouter } from './routes/friends';
import { notificationRouter } from './routes/notifications';
import { setupSocketHandlers } from './socket';
import { initializeSelfDestruct } from './services/selfDestruct';

dotenv.config();

const app = express();
const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  },
});

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

app.use('/api/auth', authRouter);
app.use('/api/rooms', roomRouter);
app.use('/api/messages', messageRouter);
app.use('/api/files', fileRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/notifications', notificationRouter);

setupSocketHandlers(io);

// Initialize self-destruct service to handle expired messages
initializeSelfDestruct(io);

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
