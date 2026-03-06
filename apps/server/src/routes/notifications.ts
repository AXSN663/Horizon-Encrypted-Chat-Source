import { Router } from 'express';
import { prisma } from '@chat/database';
import { authenticate } from '../middleware/auth';
import { io } from '../index';

const router = Router();

router.use(authenticate);

// Get all notifications for user
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId;
    
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const notification = await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all as read
router.patch('/read-all', async (req, res) => {
  try {
    const userId = (req as any).userId;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    await prisma.notification.deleteMany({
      where: { id, userId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Helper function to create notification (used by other routes)
export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  content?: string;
  senderId?: string;
  roomId?: string;
  requestId?: string;
}) {
  try {
    const notification = await prisma.notification.create({
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
    io.to(data.userId).emit('notification', notification);

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

export { router as notificationRouter };
