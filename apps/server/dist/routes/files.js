"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("@chat/database");
const auth_1 = require("../middleware/auth");
const socket_1 = require("../socket");
const router = (0, express_1.Router)();
exports.fileRouter = router;
// Constants
const UPLOAD_ROOT = path_1.default.join(__dirname, '../../uploads');
const TEMP_DIR = path_1.default.join(UPLOAD_ROOT, 'temp');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for resumable uploads
// Ensure directories exist
[UPLOAD_ROOT, TEMP_DIR].forEach(dir => {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
});
// Storage configuration
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE }
});
router.use(auth_1.authenticate);
// Helper: Get folder for file type
const getFolderForFile = (mimetype, requestedFolder) => {
    if (requestedFolder && ['Pictures', 'Files', 'groups'].includes(requestedFolder)) {
        return requestedFolder;
    }
    const isImage = mimetype.startsWith('image/');
    const isVideo = mimetype.startsWith('video/');
    return (isImage || isVideo) ? 'Pictures' : 'Files';
};
// Helper: Ensure folder exists
const ensureFolder = (folderPath) => {
    if (!fs_1.default.existsSync(folderPath)) {
        fs_1.default.mkdirSync(folderPath, { recursive: true });
    }
};
// Helper: Clean up temp file
const cleanupTempFile = (filepath) => {
    if (filepath && fs_1.default.existsSync(filepath)) {
        try {
            fs_1.default.unlinkSync(filepath);
        }
        catch (err) {
            console.error('Failed to clean up temp file:', err);
        }
    }
};
// Main file upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
    const tempFilePath = req.file?.path;
    try {
        const userId = req.userId;
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }
        const { encryptedKey, folder } = req.body;
        const fileId = (0, uuid_1.v4)();
        const filename = `${fileId}_${req.file.originalname}`;
        // Determine and create target folder
        const folderName = getFolderForFile(req.file.mimetype, folder);
        const uploadDir = path_1.default.join(UPLOAD_ROOT, folderName);
        ensureFolder(uploadDir);
        // Move file to final destination
        const finalPath = path_1.default.join(uploadDir, filename);
        fs_1.default.renameSync(tempFilePath, finalPath);
        // Create database record
        const fileRecord = await database_1.prisma.file.create({
            data: {
                filename,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
                encryptedKey,
                senderId: userId,
            }
        });
        res.json({
            file: {
                id: fileRecord.id,
                url: `/uploads/${folderName}/${filename}`,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
            }
        });
    }
    catch (error) {
        console.error('File upload error:', error);
        cleanupTempFile(tempFilePath);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});
// Get file info
router.get('/info/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const file = await database_1.prisma.file.findUnique({
            where: { id: fileId }
        });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.json({ file });
    }
    catch (error) {
        console.error('File info error:', error);
        res.status(500).json({ error: 'Failed to get file info' });
    }
});
// Download file with streaming
router.get('/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const file = await database_1.prisma.file.findUnique({
            where: { id: fileId }
        });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        const folderName = getFolderForFile(file.mimeType);
        const filepath = path_1.default.join(UPLOAD_ROOT, folderName, file.filename);
        if (!fs_1.default.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }
        // Set headers for download
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
        res.setHeader('Content-Length', file.size.toString());
        // Stream the file
        const fileStream = fs_1.default.createReadStream(filepath);
        fileStream.on('error', (err) => {
            console.error('File stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream file' });
            }
        });
        fileStream.pipe(res);
    }
    catch (error) {
        console.error('File download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});
// Direct file access (for images/videos in chat)
router.get('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const file = await database_1.prisma.file.findUnique({
            where: { id: fileId }
        });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        const folderName = getFolderForFile(file.mimeType);
        const filepath = path_1.default.join(UPLOAD_ROOT, folderName, file.filename);
        if (!fs_1.default.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }
        res.setHeader('Content-Type', file.mimeType);
        // Support range requests for video streaming
        const stat = fs_1.default.statSync(filepath);
        const fileSize = stat.size;
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = end - start + 1;
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunksize.toString());
            fs_1.default.createReadStream(filepath, { start, end }).pipe(res);
        }
        else {
            res.setHeader('Content-Length', fileSize.toString());
            fs_1.default.createReadStream(filepath).pipe(res);
        }
    }
    catch (error) {
        console.error('File access error:', error);
        res.status(500).json({ error: 'Failed to access file' });
    }
});
// Delete file
router.delete('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.userId;
        const file = await database_1.prisma.file.findUnique({
            where: { id: fileId }
        });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        // Only sender can delete
        if (file.senderId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const folderName = getFolderForFile(file.mimeType);
        const filepath = path_1.default.join(UPLOAD_ROOT, folderName, file.filename);
        // Delete from disk
        if (fs_1.default.existsSync(filepath)) {
            fs_1.default.unlinkSync(filepath);
        }
        // Delete from database
        await database_1.prisma.file.delete({
            where: { id: fileId }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('File delete error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});
// Profile picture upload (separate from main upload)
const pfpUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (req, file, cb) => {
            const pfpDir = path_1.default.join(UPLOAD_ROOT, 'pfps');
            ensureFolder(pfpDir);
            cb(null, pfpDir);
        },
        filename: (req, file, cb) => {
            const userId = req.userId;
            const fileId = (0, uuid_1.v4)();
            cb(null, `pfp_${userId}_${fileId}_${file.originalname}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for PFP
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            cb(new Error('Only image files allowed'));
            return;
        }
        cb(null, true);
    }
});
router.post('/pfp', pfpUpload.single('pfp'), async (req, res) => {
    try {
        const userId = req.userId;
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }
        // Get current user to find old PFP
        const currentUser = await database_1.prisma.user.findUnique({
            where: { id: userId },
            select: { pfpUrl: true }
        });
        // Delete old PFP file if exists
        if (currentUser?.pfpUrl) {
            const oldPfpPath = path_1.default.join(UPLOAD_ROOT, currentUser.pfpUrl.replace('/uploads/', ''));
            cleanupTempFile(oldPfpPath);
        }
        const filename = path_1.default.basename(req.file.path);
        const pfpUrl = `/uploads/pfps/${filename}`;
        const updatedUser = await database_1.prisma.user.update({
            where: { id: userId },
            data: { pfpUrl },
            select: { id: true, username: true, pfpUrl: true, publicKey: true }
        });
        // Broadcast PFP update
        socket_1.ioInstance?.emit('user-pfp-updated', { userId, pfpUrl });
        res.json({ user: updatedUser });
    }
    catch (error) {
        console.error('PFP upload error:', error);
        cleanupTempFile(req.file?.path);
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
});
