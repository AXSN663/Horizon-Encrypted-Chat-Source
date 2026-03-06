import { Router } from 'express';
import { prisma } from '@chat/database';
import { authenticate } from '../middleware/auth';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(authenticate);

router.post('/', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { roomId, content, encryptedKey, selfDestructMinutes } = req.body;

    const membership = await prisma.roomMember.findFirst({
      where: { roomId, userId }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    // Validate selfDestructMinutes - max 24 hours (1440 minutes)
    const validSelfDestructMinutes = typeof selfDestructMinutes === 'number' && 
      selfDestructMinutes > 0 && 
      selfDestructMinutes <= 1440;
    
    let selfDestruct: Date | null = null;
    if (validSelfDestructMinutes) {
      selfDestruct = new Date(Date.now() + (selfDestructMinutes as number) * 60 * 1000);
    }

    const message = await prisma.message.create({
      data: {
        content,
        encryptedKey,
        senderId: userId,
        roomId,
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

    res.json({ message });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

router.delete('/:messageId', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete associated file if exists
    if (message.fileUrl) {
      const filename = message.fileUrl.split('/').pop();
      
      // Try multiple possible paths (new folder structure and old)
      const possiblePaths = [
        path.join(__dirname, '../..', message.fileUrl),
        path.join(__dirname, '../../uploads/Pictures', filename || ''),
        path.join(__dirname, '../../uploads/Files', filename || ''),
        path.join(__dirname, '../../uploads', filename || '')
      ];
      
      let deleted = false;
      for (const filePath of possiblePaths) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted file: ${filePath}`);
            deleted = true;
            break;
          }
        } catch (err) {
          console.error('Failed to delete file at:', filePath, err);
        }
      }
      
      if (!deleted) {
        console.log('File not found in any location:', filename);
      }
      
      // Delete file record from database
      try {
        await prisma.file.deleteMany({
          where: { filename: filename }
        });
        console.log('Deleted file record from database:', filename);
      } catch (err) {
        console.error('Failed to delete file record:', err);
      }
    }

    // Hard delete from database
    await prisma.message.delete({
      where: { id: messageId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export { router as messageRouter };

