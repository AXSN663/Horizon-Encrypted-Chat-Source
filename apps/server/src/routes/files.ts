import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { prisma } from '@chat/database';
import { authenticate } from '../middleware/auth';
import { ioInstance } from '../socket';

const router = Router();

// Rate limiting for uploads - 5 uploads per minute per user
const uploadAttempts = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 uploads per minute

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const attempts = uploadAttempts.get(userId) || [];
  // Remove attempts outside the window
  const recentAttempts = attempts.filter(time => now - time < RATE_LIMIT_WINDOW);
  uploadAttempts.set(userId, recentAttempts);
  return recentAttempts.length >= RATE_LIMIT_MAX;
}

function recordAttempt(userId: string): void {
  const attempts = uploadAttempts.get(userId) || [];
  attempts.push(Date.now());
  uploadAttempts.set(userId, attempts);
}

// Constants
const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for resumable uploads

// Ensure directories exist
[UPLOAD_ROOT, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: MAX_FILE_SIZE }
});

router.use(authenticate);

// Helper: Get folder for file type
const getFolderForFile = (mimetype: string, requestedFolder?: string): string => {
  if (requestedFolder && ['Pictures', 'Files', 'groups'].includes(requestedFolder)) {
    return requestedFolder;
  }
  const isImage = mimetype.startsWith('image/');
  const isVideo = mimetype.startsWith('video/');
  return (isImage || isVideo) ? 'Pictures' : 'Files';
};

// Helper: Ensure folder exists
const ensureFolder = (folderPath: string): void => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
};

// Helper: Clean up temp file
const cleanupTempFile = (filepath: string | undefined): void => {
  if (filepath && fs.existsSync(filepath)) {
    try {
      fs.unlinkSync(filepath);
    } catch (err) {
      console.error('Failed to clean up temp file:', err);
    }
  }
};

// Main file upload endpoint
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const tempFilePath = req.file?.path;
  
  try {
    const userId = (req as any).userId;
    
    // Check rate limit
    if (isRateLimited(userId)) {
      cleanupTempFile(tempFilePath);
      return res.status(429).json({ error: 'Rate limit exceeded. Max 5 uploads per minute.' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Record upload attempt
    recordAttempt(userId);

    const { encryptedKey, folder } = req.body;
    const fileId = uuidv4();
    const filename = `${fileId}_${req.file.originalname}`;
    
    // Determine and create target folder
    const folderName = getFolderForFile(req.file.mimetype, folder);
    const uploadDir = path.join(UPLOAD_ROOT, folderName);
    ensureFolder(uploadDir);

    // Move file to final destination
    const finalPath = path.join(uploadDir, filename);
    fs.renameSync(tempFilePath!, finalPath);

    // Create database record
    const fileRecord = await prisma.file.create({
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
  } catch (error) {
    console.error('File upload error:', error);
    cleanupTempFile(tempFilePath);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get file info
router.get('/info/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ file });
  } catch (error) {
    console.error('File info error:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

// Download file with streaming
router.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const folderName = getFolderForFile(file.mimeType);
    const filepath = path.join(UPLOAD_ROOT, folderName, file.filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set headers for download
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Length', file.size.toString());
    
    // Stream the file
    const fileStream = fs.createReadStream(filepath);
    
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Direct file access (for images/videos in chat)
router.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const folderName = getFolderForFile(file.mimeType);
    const filepath = path.join(UPLOAD_ROOT, folderName, file.filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', file.mimeType);
    
    // Support range requests for video streaming
    const stat = fs.statSync(filepath);
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
      
      fs.createReadStream(filepath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize.toString());
      fs.createReadStream(filepath).pipe(res);
    }
  } catch (error) {
    console.error('File access error:', error);
    res.status(500).json({ error: 'Failed to access file' });
  }
});

// Delete file
router.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = (req as any).userId;
    
    const file = await prisma.file.findUnique({
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
    const filepath = path.join(UPLOAD_ROOT, folderName, file.filename);
    
    // Delete from disk
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Delete from database
    await prisma.file.delete({
      where: { id: fileId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Profile picture upload (separate from main upload)
const pfpUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const pfpDir = path.join(UPLOAD_ROOT, 'pfps');
      ensureFolder(pfpDir);
      cb(null, pfpDir);
    },
    filename: (req, file, cb) => {
      const userId = (req as any).userId;
      const fileId = uuidv4();
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

router.post('/pfp', pfpUpload.single('pfp'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    // Check rate limit for PFP uploads - 3 per minute
    if (isRateLimited(userId)) {
      cleanupTempFile(req.file?.path);
      return res.status(429).json({ error: 'Rate limit exceeded. Max 3 PFP uploads per minute.' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Record upload attempt
    recordAttempt(userId);

    // Get current user to find old PFP
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { pfpUrl: true }
    });

    // Delete old PFP file if exists
    if (currentUser?.pfpUrl) {
      const oldPfpPath = path.join(UPLOAD_ROOT, currentUser.pfpUrl.replace('/uploads/', ''));
      cleanupTempFile(oldPfpPath);
    }

    const filename = path.basename(req.file.path);
    const pfpUrl = `/uploads/pfps/${filename}`;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { pfpUrl },
      select: { id: true, username: true, pfpUrl: true, publicKey: true }
    });

    // Broadcast PFP update
    ioInstance?.emit('user-pfp-updated', { userId, pfpUrl });

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('PFP upload error:', error);
    cleanupTempFile(req.file?.path);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

export { router as fileRouter };
