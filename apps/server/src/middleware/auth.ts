import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@chat/database';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Check if token is in the revoked list
    const revokedToken = await prisma.revokedToken.findUnique({
      where: { token }
    });

    if (revokedToken) {
      return res.status(401).json({ error: 'Token revoked. Please log in again.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string; tokenVersion?: number };
    
    // Check if token version matches current user token version
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { tokenVersion: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // If tokenVersion doesn't match, token is invalid (user reset password)
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'Token revoked. Please log in again.' });
    }

    (req as any).userId = decoded.userId;
    (req as any).token = token;
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
