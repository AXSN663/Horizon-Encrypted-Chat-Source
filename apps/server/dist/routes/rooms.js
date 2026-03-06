"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomRouter = void 0;
const express_1 = require("express");
const database_1 = require("@chat/database");
const auth_1 = require("../middleware/auth");
const index_1 = require("../index");
const router = (0, express_1.Router)();
exports.roomRouter = router;
router.use(auth_1.authenticate);
// Get all rooms for user
router.get('/', async (req, res) => {
    try {
        const userId = req.userId;
        const rooms = await database_1.prisma.room.findMany({
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
    }
    catch (error) {
        console.error('Get rooms error:', error);
        res.status(500).json({ error: 'Failed to get rooms' });
    }
});
// Create a new room (group)
router.post('/', async (req, res) => {
    try {
        const userId = req.userId;
        const { name, type, memberIds } = req.body;
        if (!name || !type || !memberIds || !Array.isArray(memberIds)) {
            return res.status(400).json({ error: 'Invalid request body' });
        }
        const room = await database_1.prisma.room.create({
            data: {
                name,
                type,
                ownerId: userId,
                members: {
                    create: [
                        { userId },
                        ...memberIds.filter((id) => id !== userId).map((id) => ({
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
        memberIds.forEach((memberId) => {
            index_1.io.to(memberId).emit('room-created', { room });
        });
        res.json({ room });
    }
    catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});
// Create DM room
router.post('/dm', async (req, res) => {
    try {
        const userId = req.userId;
        const { targetUserId } = req.body;
        if (!targetUserId) {
            return res.status(400).json({ error: 'Target user ID required' });
        }
        // Check if DM already exists
        const existingRoom = await database_1.prisma.room.findFirst({
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
        const room = await database_1.prisma.room.create({
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
        index_1.io.to(userId).to(targetUserId).emit('room-created', { room });
        res.json({ room });
    }
    catch (error) {
        console.error('Create DM error:', error);
        res.status(500).json({ error: 'Failed to create DM' });
    }
});
// Get messages for a room
router.get('/:roomId/messages', async (req, res) => {
    try {
        const userId = req.userId;
        const { roomId } = req.params;
        const { cursor } = req.query;
        // Check if user is member
        const membership = await database_1.prisma.roomMember.findFirst({
            where: {
                roomId,
                userId
            }
        });
        if (!membership) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }
        const messages = await database_1.prisma.message.findMany({
            where: {
                roomId,
                ...(cursor ? { id: { lt: cursor } } : {})
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
    }
    catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});
// Leave room
router.post('/:roomId/leave', async (req, res) => {
    try {
        const userId = req.userId;
        const { roomId } = req.params;
        const room = await database_1.prisma.room.findUnique({
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
        await database_1.prisma.roomMember.deleteMany({
            where: {
                roomId,
                userId
            }
        });
        // Notify room
        index_1.io.to(roomId).emit('member-left', { roomId, userId });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Leave room error:', error);
        res.status(500).json({ error: 'Failed to leave room' });
    }
});
// Delete room (owner only)
router.delete('/:roomId', async (req, res) => {
    try {
        const userId = req.userId;
        const { roomId } = req.params;
        const room = await database_1.prisma.room.findUnique({
            where: { id: roomId }
        });
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        if (room.ownerId !== userId) {
            return res.status(403).json({ error: 'Only owner can delete room' });
        }
        await database_1.prisma.room.delete({
            where: { id: roomId }
        });
        // Notify members
        index_1.io.to(roomId).emit('room-deleted', { roomId });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Delete room error:', error);
        res.status(500).json({ error: 'Failed to delete room' });
    }
});
// Update room (owner only)
router.patch('/:roomId', async (req, res) => {
    try {
        const userId = req.userId;
        const { roomId } = req.params;
        const { name, groupImage } = req.body;
        const room = await database_1.prisma.room.findUnique({
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
        const updateData = {};
        if (name)
            updateData.name = name;
        if (groupImage)
            updateData.groupImage = groupImage;
        // Delete old group image if a new one is being uploaded
        if (groupImage && room.groupImage) {
            const fs = require('fs');
            const path = require('path');
            const oldImagePath = path.join(__dirname, '../../uploads', room.groupImage.replace('/uploads/', ''));
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }
        const updatedRoom = await database_1.prisma.room.update({
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
        index_1.io.emit('group-updated', {
            roomId,
            type: 'group-info-updated',
            room: updatedRoom
        });
        res.json({ room: updatedRoom });
    }
    catch (error) {
        console.error('Update room error:', error);
        res.status(500).json({ error: 'Failed to update room' });
    }
});
