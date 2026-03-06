"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const auth_1 = require("./routes/auth");
const rooms_1 = require("./routes/rooms");
const messages_1 = require("./routes/messages");
const files_1 = require("./routes/files");
const friends_1 = require("./routes/friends");
const notifications_1 = require("./routes/notifications");
const socket_1 = require("./socket");
const selfDestruct_1 = require("./services/selfDestruct");
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
exports.io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true,
    },
});
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
    });
});
app.use('/api/auth', auth_1.authRouter);
app.use('/api/rooms', rooms_1.roomRouter);
app.use('/api/messages', messages_1.messageRouter);
app.use('/api/files', files_1.fileRouter);
app.use('/api/friends', friends_1.friendsRouter);
app.use('/api/notifications', notifications_1.notificationRouter);
(0, socket_1.setupSocketHandlers)(exports.io);
// Initialize self-destruct service to handle expired messages
(0, selfDestruct_1.initializeSelfDestruct)(exports.io);
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
