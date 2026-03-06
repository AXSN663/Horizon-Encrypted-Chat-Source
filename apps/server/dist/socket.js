"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketHandlers = exports.ioInstance = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("@chat/database");
const notifications_1 = require("./routes/notifications");
const selfDestruct_1 = require("./services/selfDestruct");
// Export io instance for use by other services
exports.ioInstance = null;
const setupSocketHandlers = (io) => {
    exports.ioInstance = io;
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('No token provided'));
            }
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
            socket.userId = decoded.userId;
            socket.username = decoded.username;
            next();
        }
        catch (error) {
            next(new Error('Invalid token'));
        }
    });
    // Track online users and their active rooms
    const onlineUsers = new Map(); // userId -> socketId
    const userActiveRooms = new Map(); // userId -> roomId they're currently viewing
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.username}`);
        // Mark user as online and join personal room for notifications
        if (socket.userId) {
            onlineUsers.set(socket.userId, socket.id);
            socket.join(socket.userId); // Join personal room for notifications
            io.emit('user-status', { userId: socket.userId, status: 'online' });
        }
        socket.on('join-room', (roomId) => {
            socket.join(roomId);
            if (socket.userId) {
                userActiveRooms.set(socket.userId, roomId);
            }
            socket.to(roomId).emit('user-joined', { userId: socket.userId, username: socket.username });
        });
        socket.on('leave-room', (roomId) => {
            socket.leave(roomId);
            if (socket.userId && userActiveRooms.get(socket.userId) === roomId) {
                userActiveRooms.delete(socket.userId);
            }
            socket.to(roomId).emit('user-left', { userId: socket.userId, username: socket.username });
        });
        socket.on('send-message', async (data) => {
            try {
                const membership = await database_1.prisma.roomMember.findFirst({
                    where: { roomId: data.roomId, userId: socket.userId }
                });
                if (!membership) {
                    socket.emit('error', { message: 'Not a member of this room' });
                    return;
                }
                let selfDestruct = null;
                if (data.selfDestructMinutes && data.selfDestructMinutes > 0) {
                    selfDestruct = new Date(Date.now() + data.selfDestructMinutes * 60 * 1000);
                }
                const message = await database_1.prisma.message.create({
                    data: {
                        content: data.content,
                        encryptedKey: data.encryptedKey,
                        iv: data.iv,
                        senderId: socket.userId,
                        roomId: data.roomId,
                        fileUrl: data.fileUrl,
                        fileName: data.fileName,
                        fileType: data.fileType,
                        selfDestruct,
                    },
                    include: {
                        sender: {
                            select: {
                                id: true,
                                username: true,
                                pfpUrl: true,
                            }
                        }
                    }
                });
                io.to(data.roomId).emit('new-message', {
                    ...message,
                    iv: data.iv,
                });
                // Create notifications for other room members and emit real-time events
                const roomMembers = await database_1.prisma.roomMember.findMany({
                    where: { roomId: data.roomId, userId: { not: socket.userId } },
                    include: { user: { select: { id: true, username: true } } }
                });
                for (const member of roomMembers) {
                    // Emit directly to each user's personal room for real-time update
                    io.to(member.userId).emit('new-message-notification', {
                        roomId: data.roomId,
                        senderId: socket.userId,
                        senderName: socket.username
                    });
                    await (0, notifications_1.createNotification)({
                        userId: member.userId,
                        type: 'message',
                        title: `New message from ${socket.username}`,
                        content: data.fileName ? `Sent a file: ${data.fileName}` : 'Sent a message',
                        senderId: socket.userId,
                        roomId: data.roomId
                    });
                }
                // Schedule self-destruct using the persistent service
                if (selfDestruct && data.selfDestructMinutes) {
                    (0, selfDestruct_1.scheduleSelfDestruct)(message.id, selfDestruct, io);
                }
            }
            catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        socket.on('delete-message', async (data) => {
            try {
                // Verify the user owns this message
                const message = await database_1.prisma.message.findFirst({
                    where: {
                        id: data.messageId,
                        senderId: socket.userId
                    }
                });
                if (!message) {
                    socket.emit('error', { message: 'Message not found or not authorized' });
                    return;
                }
                // Clear any pending self-destruct timer
                (0, selfDestruct_1.clearSelfDestructTimer)(data.messageId);
                // Delete associated file if exists
                if (message.fileUrl) {
                    const fs = require('fs');
                    const path = require('path');
                    const filename = message.fileUrl.split('/').pop();
                    console.log(`[DELETE] File URL: ${message.fileUrl}`);
                    console.log(`[DELETE] Filename: ${filename}`);
                    // Build all possible file paths - files are in apps/server/uploads/
                    const paths = [
                        path.join(__dirname, '../../uploads/Pictures', filename),
                        path.join(__dirname, '../../uploads/Files', filename),
                        path.join(__dirname, '../../uploads', filename),
                        path.join(__dirname, '../uploads/Pictures', filename),
                        path.join(__dirname, '../uploads/Files', filename),
                        path.join(__dirname, '../uploads', filename)
                    ];
                    console.log(`[DELETE] Checking paths:`, paths);
                    // Delete file from disk
                    let fileDeleted = false;
                    for (const fp of paths) {
                        console.log(`[DELETE] Checking: ${fp} - Exists: ${fs.existsSync(fp)}`);
                        if (fs.existsSync(fp)) {
                            try {
                                fs.unlinkSync(fp);
                                fileDeleted = true;
                                console.log(`[DELETE] SUCCESS: File deleted from ${fp}`);
                                break;
                            }
                            catch (err) {
                                console.log(`[DELETE] FAILED to delete file: ${err.message}`);
                            }
                        }
                    }
                    if (!fileDeleted) {
                        console.log(`[DELETE] FAILED: File not found in any location`);
                    }
                    // Delete from database
                    if (filename) {
                        try {
                            const result = await database_1.prisma.file.deleteMany({ where: { filename } });
                            console.log(`[DELETE] Database: ${result.count} file record(s) deleted`);
                        }
                        catch (err) {
                            console.log(`[DELETE] Database FAILED: ${err.message}`);
                        }
                    }
                }
                // Hard delete from database
                await database_1.prisma.message.delete({
                    where: { id: data.messageId }
                });
                // Notify all users in the room
                if (data.roomId) {
                    io.to(data.roomId).emit('message-deleted', { messageId: data.messageId });
                }
            }
            catch (error) {
                console.error('Delete message error:', error);
                socket.emit('error', { message: 'Failed to delete message' });
            }
        });
        socket.on('typing', (data) => {
            socket.to(data.roomId).emit('user-typing', {
                userId: socket.userId,
                username: socket.username,
                isTyping: data.isTyping
            });
        });
        // Self-destruct setting sync
        // Get online users list
        socket.on('get-online-users', () => {
            socket.emit('online-users', Array.from(onlineUsers.keys()));
        });
        // Handle request for current self-destruct setting
        socket.on('request-self-destruct-setting', (data) => {
            // Broadcast to other users in the room to send their current setting
            socket.to(data.roomId).emit('self-destruct-setting-requested', {
                requesterId: socket.userId
            });
        });
        // Handle response with current self-destruct setting
        socket.on('self-destruct-setting-response', (data) => {
            // Send the setting to the requester
            socket.to(data.roomId).emit('self-destruct-sync', {
                minutes: data.minutes
            });
        });
        socket.on('self-destruct-change', (data) => {
            const timeLabel = data.minutes === 0
                ? 'Off'
                : data.minutes < 1
                    ? `${Math.round(data.minutes * 60)}s`
                    : `${data.minutes}m`;
            socket.to(data.roomId).emit('system-message', {
                type: 'self-destruct-changed',
                message: `${socket.username} set self-destruct to ${timeLabel}`,
                roomId: data.roomId,
                timestamp: new Date().toISOString()
            });
            // Also sync the setting to the other user
            socket.to(data.roomId).emit('self-destruct-sync', {
                minutes: data.minutes,
                label: data.label
            });
        });
        // Handle room deletion (when user blocks or unfriends)
        socket.on('delete-room', async (data) => {
            try {
                // Broadcast to all clients that this room is deleted
                io.emit('room-deleted', { roomId: data.roomId });
                // Notify both users to refresh their friends list
                io.emit('friends-updated', { userId: socket.userId });
                io.emit('friends-updated', { userId: data.targetUserId });
            }
            catch (error) {
                console.error('Delete room error:', error);
            }
        });
        // Handle friend request notifications
        socket.on('friend-request-sent', (data) => {
            // Broadcast to all clients that a friend request was sent
            io.emit('friend-request-received', {
                senderId: socket.userId,
                senderUsername: socket.username,
                targetUserId: data.targetUserId
            });
        });
        // Handle friend request accepted
        socket.on('friend-request-accepted', () => {
            // Notify all users to refresh their friends list
            io.emit('friends-updated', { userId: socket.userId });
        });
        // Handle group updates (kick, leave, add member, delete group)
        socket.on('group-updated', (data) => {
            // Broadcast to all members in the group
            io.to(data.roomId).emit('group-updated', data);
            // Also broadcast globally so users not currently in the room get updated
            io.emit('rooms-updated', { roomId: data.roomId, type: data.type });
        });
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.username}`);
            // Mark user as offline and clear active room
            if (socket.userId) {
                onlineUsers.delete(socket.userId);
                userActiveRooms.delete(socket.userId);
                io.emit('user-status', { userId: socket.userId, status: 'offline' });
            }
        });
    });
};
exports.setupSocketHandlers = setupSocketHandlers;
