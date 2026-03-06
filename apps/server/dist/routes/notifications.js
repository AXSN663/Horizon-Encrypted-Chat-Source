"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = void 0;
exports.createNotification = createNotification;
const express_1 = require("express");
const database_1 = require("@chat/database");
const auth_1 = require("../middleware/auth");
const index_1 = require("../index");
const router = (0, express_1.Router)();
exports.notificationRouter = router;
router.use(auth_1.authenticate);
// Get all notifications for user
router.get('/', async (req, res) => {
    try {
        const userId = req.userId;
        const notifications = await database_1.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json({ notifications });
    }
    catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});
// Mark notification as read
router.patch('/:id/read', async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const notification = await database_1.prisma.notification.updateMany({
            where: { id, userId },
            data: { isRead: true }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});
// Mark all as read
router.patch('/read-all', async (req, res) => {
    try {
        const userId = req.userId;
        await database_1.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});
// Delete notification
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        await database_1.prisma.notification.deleteMany({
            where: { id, userId }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});
// Helper function to create notification (used by other routes)
async function createNotification(data) {
    try {
        const notification = await database_1.prisma.notification.create({
            data: {
                userId: data.userId,
                type: data.type,
                title: data.title,
                content: data.content,
                senderId: data.senderId,
                roomId: data.roomId,
                requestId: data.requestId
            }
        });
        // Emit to user's socket
        index_1.io.to(data.userId).emit('notification', notification);
        return notification;
    }
    catch (error) {
        console.error('Create notification error:', error);
        return null;
    }
}
