import { Router } from 'express';
import { prisma } from '@chat/database';
import { authenticate } from '../middleware/auth';
import { createNotification } from './notifications';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(authenticate);

// Get all friends
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId;
    
    const friendships = await prisma.friendship.findMany({
      where: { userId },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            pfpUrl: true,
            status: true,
            customStatus: true,
            publicKey: true,
          }
        }
      }
    });

    res.json({ friends: friendships.map(f => f.friend) });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// Search users by username
router.get('/search', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { query } = req.query;
    
    const users = await prisma.user.findMany({
      where: {
        username: { contains: query as string },
        id: { not: userId }
      },
      select: {
        id: true,
        username: true,
        pfpUrl: true,
        publicKey: true,
      },
      take: 10
    });

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Send friend request
router.post('/request', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Find user by username
    const receiver = await prisma.user.findUnique({
      where: { username: username.trim() }
    });

    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    const receiverId = receiver.id;

    if (userId === receiverId) {
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    }

    // Check if sender is blocked by receiver
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        blockerId: receiverId,
        blockedId: userId
      }
    });

    if (isBlocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if receiver is blocked by sender
    const hasBlocked = await prisma.blockedUser.findFirst({
      where: {
        blockerId: userId,
        blockedId: receiverId
      }
    });

    if (hasBlocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already friends
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: receiverId },
          { userId: receiverId, friendId: userId }
        ]
      }
    });

    if (existingFriendship) {
      return res.status(400).json({ error: 'Already friends' });
    }

    // Delete any existing requests between these users (to allow fresh request)
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId },
          { senderId: receiverId, receiverId: userId }
        ]
      }
    });

    const request = await prisma.friendRequest.create({
      data: {
        senderId: userId,
        receiverId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            pfpUrl: true,
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            pfpUrl: true,
          }
        }
      }
    });

    // Create notification for receiver
    await createNotification({
      userId: receiverId,
      type: 'friend_request',
      title: 'New Friend Request',
      content: `${request.sender.username} wants to be your friend`,
      senderId: userId,
      requestId: request.id
    });

    res.json({ request });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Get pending friend requests
router.get('/requests', async (req, res) => {
  try {
    const userId = (req as any).userId;
    
    const [sent, received] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { senderId: userId, status: 'PENDING' },
        include: {
          receiver: {
            select: {
              id: true,
              username: true,
              pfpUrl: true,
            }
          }
        }
      }),
      prisma.friendRequest.findMany({
        where: { receiverId: userId, status: 'PENDING' },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              pfpUrl: true,
            }
          }
        }
      })
    ]);

    res.json({ sent, received });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

// Accept friend request
router.post('/accept', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { requestId } = req.body;

    const request = await prisma.friendRequest.findUnique({
      where: { id: requestId }
    });

    if (!request || request.receiverId !== userId) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request already handled' });
    }

    // Create friendship (both directions)
    await prisma.$transaction([
      prisma.friendship.create({
        data: {
          userId: request.senderId,
          friendId: request.receiverId,
        }
      }),
      prisma.friendship.create({
        data: {
          userId: request.receiverId,
          friendId: request.senderId,
        }
      }),
      prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED' }
      })
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Reject friend request
router.post('/reject', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { requestId } = req.body;

    const request = await prisma.friendRequest.findUnique({
      where: { id: requestId }
    });

    if (!request || request.receiverId !== userId) {
      return res.status(404).json({ error: 'Request not found' });
    }

    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// Remove friend
router.delete('/:friendId', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { friendId } = req.params;

    // Find the DM room between these users
    const room = await prisma.room.findFirst({
      where: {
        type: 'DM',
        members: {
          every: {
            userId: { in: [userId, friendId] }
          }
        }
      },
      include: {
        members: true
      }
    });

    await prisma.$transaction([
      prisma.friendship.deleteMany({
        where: {
          OR: [
            { userId, friendId },
            { userId: friendId, friendId: userId }
          ]
        }
      }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: userId, receiverId: friendId },
            { senderId: friendId, receiverId: userId }
          ]
        }
      }),
      // Delete messages if room exists
      ...(room ? [prisma.message.deleteMany({ where: { roomId: room.id } })] : []),
      // Delete room members if room exists
      ...(room ? [prisma.roomMember.deleteMany({ where: { roomId: room.id } })] : []),
      // Delete room if exists
      ...(room ? [prisma.room.delete({ where: { id: room.id } })] : [])
    ]);

    res.json({ success: true, roomDeleted: !!room });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Block a user
router.post('/block', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID required' });
    }

    // Remove from friends if they are friends
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId }
        ]
      }
    });

    // Delete any pending friend requests between these users
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: userId }
        ]
      }
    });

    // Find and delete the DM room between these users
    const room = await prisma.room.findFirst({
      where: {
        type: 'DM',
        members: {
          every: {
            userId: { in: [userId, targetUserId] }
          }
        }
      },
      include: {
        members: true
      }
    });

    if (room) {
      // Get all files associated with messages in this room before deleting messages
      const messagesWithFiles = await prisma.message.findMany({
        where: { 
          roomId: room.id,
          fileUrl: { not: null }
        }
      });

      // Delete uploaded files from disk
      const baseUploadDir = path.join(__dirname, '../../uploads');
      for (const message of messagesWithFiles) {
        if (message.fileUrl) {
          // Try both old path and new path (Pictures/Files subfolders)
          const possiblePaths = [
            path.join(baseUploadDir, message.fileUrl.replace('/uploads/', '')),
            path.join(baseUploadDir, 'Pictures', message.fileUrl.split('/').pop() || ''),
            path.join(baseUploadDir, 'Files', message.fileUrl.split('/').pop() || '')
          ];
          
          for (const filepath of possiblePaths) {
            if (fs.existsSync(filepath)) {
              try {
                fs.unlinkSync(filepath);
                console.log('Deleted file:', filepath);
                break;
              } catch (err) {
                console.error('Failed to delete file:', filepath, err);
              }
            }
          }
          
          // Delete file record from database
          try {
            await prisma.file.deleteMany({
              where: { filename: message.fileUrl.split('/').pop() }
            });
          } catch (err) {
            console.error('Failed to delete file record:', err);
          }
        }
      }



      // Delete all messages in the room
      await prisma.message.deleteMany({
        where: { roomId: room.id }
      });

      // Delete room members
      await prisma.roomMember.deleteMany({
        where: { roomId: room.id }
      });

      // Delete the room
      await prisma.room.delete({
        where: { id: room.id }
      });
    }

    // Create block record
    await prisma.blockedUser.create({
      data: {
        blockerId: userId,
        blockedId: targetUserId
      }
    });

    res.json({ success: true, roomDeleted: !!room });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Unblock a user
router.post('/unblock', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID required' });
    }

    await prisma.blockedUser.deleteMany({
      where: {
        blockerId: userId,
        blockedId: targetUserId
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// Get blocked users
router.get('/blocked', async (req, res) => {
  try {
    const userId = (req as any).userId;

    const blocked = await prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            pfpUrl: true,
            createdAt: true
          }
        }
      }
    });

    res.json({ blockedUsers: blocked.map(b => b.blocked) });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to get blocked users' });
  }
});

export { router as friendsRouter };
