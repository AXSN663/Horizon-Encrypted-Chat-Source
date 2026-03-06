"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageRouter = void 0;
const express_1 = require("express");
const database_1 = require("@chat/database");
const auth_1 = require("../middleware/auth");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
exports.messageRouter = router;
router.use(auth_1.authenticate);
router.post('/', async (req, res) => {
    try {
        const userId = req.userId;
        const { roomId, content, encryptedKey, selfDestructMinutes } = req.body;
        const membership = await database_1.prisma.roomMember.findFirst({
            where: { roomId, userId }
        });
        if (!membership) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }
        let selfDestruct = null;
        if (selfDestructMinutes && selfDestructMinutes > 0) {
            selfDestruct = new Date(Date.now() + selfDestructMinutes * 60 * 1000);
        }
        const message = await database_1.prisma.message.create({
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
    }
    catch (error) {
        console.error('Create message error:', error);
        res.status(500).json({ error: 'Failed to create message' });
    }
});
router.delete('/:messageId', async (req, res) => {
    try {
        const userId = req.userId;
        const { messageId } = req.params;
        const message = await database_1.prisma.message.findUnique({
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
                path_1.default.join(__dirname, '../..', message.fileUrl),
                path_1.default.join(__dirname, '../../uploads/Pictures', filename || ''),
                path_1.default.join(__dirname, '../../uploads/Files', filename || ''),
                path_1.default.join(__dirname, '../../uploads', filename || '')
            ];
            let deleted = false;
            for (const filePath of possiblePaths) {
                try {
                    if (fs_1.default.existsSync(filePath)) {
                        fs_1.default.unlinkSync(filePath);
                        console.log(`Deleted file: ${filePath}`);
                        deleted = true;
                        break;
                    }
                }
                catch (err) {
                    console.error('Failed to delete file at:', filePath, err);
                }
            }
            if (!deleted) {
                console.log('File not found in any location:', filename);
            }
            // Delete file record from database
            try {
                await database_1.prisma.file.deleteMany({
                    where: { filename: filename }
                });
                console.log('Deleted file record from database:', filename);
            }
            catch (err) {
                console.error('Failed to delete file record:', err);
            }
        }
        // Hard delete from database
        await database_1.prisma.message.delete({
            where: { id: messageId }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});
