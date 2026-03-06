import { Router } from 'express';
import { prisma } from '@chat/database';
import { authenticate } from '../middleware/auth';
import { io } from '../index';

const router = Router();

router.use(authenticate);

// Get all rooms for user
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId;
    
    const rooms = await prisma.room.findMany({
      where: {
        members: {
          some: { userId }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                pfpUrl: true,
                publicKey: true,
              }
            }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

// Create a new room (group)
router.post('/', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { name, type, memberIds } = req.body;

    if (!name || !type || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const room = await prisma.room.create({
      data: {
        name,
        type,
        ownerId: userId,
        members: {
          create: [
            { userId },
            ...memberIds.filter((id: string) => id !== userId).map((id: string) => ({
              userId: id
            }))
          ]
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                pfpUrl: true,
                publicKey: true,
              }
            }
          }
        }
      }
    });

    // Notify members
    memberIds.forEach((memberId: string) => {
      io.to(memberId).emit('room-created', { room });
    });

    res.json({ room });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Create DM room
router.post('/dm', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID required' });
    }

    // Check if DM already exists
    const existingRoom = await prisma.room.findFirst({
      where: {
        type: 'DM',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } }
        ]
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                pfpUrl: true,
                publicKey: true,
              }
            }
          }
        }
      }
    });

    if (existingRoom) {
      return res.json({ room: existingRoom });
    }

    // Create new DM
    const room = await prisma.room.create({
      data: {
        name: 'DM',
        type: 'DM',
        members: {
          create: [
            { userId },
            { userId: targetUserId }
          ]
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                pfpUrl: true,
                publicKey: true,
              }
            }
          }
        }
      }
    });

    // Notify both users
    io.to(userId).to(targetUserId).emit('room-created', { room });

    res.json({ room });
  } catch (error) {
    console.error('Create DM error:', error);
    res.status(500).json({ error: 'Failed to create DM' });
  }
});

// Get messages for a room
router.get('/:roomId/messages', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { roomId } = req.params;
    const { cursor } = req.query;

    // Check if user is member
    const membership = await prisma.roomMember.findFirst({
      where: {
        roomId,
        userId
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId,
        ...(cursor ? { id: { lt: cursor as string } } : {})
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
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

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Leave room
router.post('/:roomId/leave', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { members: true }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.type === 'DM') {
      return res.status(400).json({ error: 'Cannot leave DM' });
    }

    // Remove member
    await prisma.roomMember.deleteMany({
      where: {
        roomId,
        userId
      }
    });

    // Notify room
    io.to(roomId).emit('member-left', { roomId, userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

// Add member to group (owner only)
router.post('/:roomId/add-member', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { roomId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID required' });
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { members: true }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.type !== 'GROUP') {
      return res.status(400).json({ error: 'Can only add members to groups' });
    }

    if (room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only owner can add members' });
    }

    // Check if user is already a member
    const existingMember = room.members.find(m => m.userId === targetUserId);
    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Add member
    await prisma.roomMember.create({
      data: {
        roomId,
        userId: targetUserId
      }
    });

    // Get updated room with new member
    const updatedRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                pfpUrl: true,
                publicKey: true,
              }
            }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      }
    });

    // Notify the new member directly to their personal room
    console.log('Emitting group-updated member-added for user:', targetUserId, 'room:', roomId);
    io.to(targetUserId).emit('group-updated', {
      roomId,
      type: 'member-added',
      userId: targetUserId,
      room: updatedRoom
    });
    // Also broadcast to all for redundancy
    io.emit('group-updated', {
      roomId,
      type: 'member-added',
      userId: targetUserId,
      room: updatedRoom
    });

    // Also notify existing members about the new member
    io.to(roomId).emit('member-added', { roomId, userId: targetUserId });

    res.json({ success: true, room: updatedRoom });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Delete room (owner only)
router.delete('/:roomId', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only owner can delete room' });
    }

    // Get members before deleting
    const members = await prisma.roomMember.findMany({
      where: { roomId },
      select: { userId: true }
    });
    const memberIds = members.map(m => m.userId);

    // Get all messages with files to delete physical files
    const messagesWithFiles = await prisma.message.findMany({
      where: { roomId, fileUrl: { not: null } },
      select: { fileUrl: true }
    });

    // Delete physical files from disk
    const fs = require('fs');
    const path = require('path');
    for (const msg of messagesWithFiles) {
      if (msg.fileUrl) {
        const filePath = path.join(__dirname, '../../uploads', msg.fileUrl.replace('/uploads/', ''));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Delete group image if exists
    if (room.groupImage) {
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, '../../uploads', room.groupImage.replace('/uploads/', ''));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await prisma.room.delete({
      where: { id: roomId }
    });

    // Notify all members via broadcast
    console.log('Emitting room-deleted for room:', roomId, 'members:', memberIds);
    io.emit('room-deleted', { roomId, memberIds });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Update room (owner only)
router.patch('/:roomId', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { roomId } = req.params;
    const { name, groupImage } = req.body;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { ownerId: true, type: true, groupImage: true }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.type !== 'GROUP') {
      return res.status(400).json({ error: 'Can only update groups' });
    }

    if (room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only owner can update room' });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (groupImage) updateData.groupImage = groupImage;

    // Delete old group image if a new one is being uploaded
    if (groupImage && room.groupImage) {
      const fs = require('fs');
      const path = require('path');
      const oldImagePath = path.join(__dirname, '../../uploads', room.groupImage.replace('/uploads/', ''));
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: updateData,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                pfpUrl: true,
                publicKey: true,
              }
            }
          }
        }
      }
    });

    // Emit socket event to notify all clients about the group update
    io.emit('group-updated', { 
      roomId, 
      type: 'group-info-updated',
      room: updatedRoom
    });

    res.json({ room: updatedRoom });
  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ error: 'Failed to update room' });
  }
});

export { router as roomRouter };
