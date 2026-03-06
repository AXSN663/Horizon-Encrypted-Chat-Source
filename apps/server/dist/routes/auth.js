"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("@chat/database");
const index_1 = require("../index");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
exports.authRouter = router;
// Cloudflare Turnstile secret key
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
// Verify CAPTCHA token
async function verifyCaptcha(token) {
    // Always verify the token format
    if (!token || token.length < 10) {
        return false;
    }
    // If no secret key is set, accept any token (for development only)
    if (!TURNSTILE_SECRET_KEY || TURNSTILE_SECRET_KEY === 'your_turnstile_secret_key_here') {
        console.log('CAPTCHA verification skipped - no secret key configured');
        return true;
    }
    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                secret: TURNSTILE_SECRET_KEY,
                response: token,
            }),
        });
        const data = await response.json();
        return data.success === true;
    }
    catch (error) {
        console.error('CAPTCHA verification error:', error);
        return false;
    }
}
router.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey, captchaToken } = req.body;
        // Verify CAPTCHA is required
        if (!captchaToken) {
            return res.status(400).json({ error: 'CAPTCHA required' });
        }
        // Verify CAPTCHA token
        const isValidCaptcha = await verifyCaptcha(captchaToken);
        if (!isValidCaptcha) {
            return res.status(400).json({ error: 'Invalid CAPTCHA' });
        }
        const existingUser = await database_1.prisma.user.findUnique({
            where: { username },
        });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await database_1.prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                publicKey,
            },
            select: {
                id: true,
                username: true,
                publicKey: true,
                pfpUrl: true,
                createdAt: true,
            },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, tokenVersion: 0 }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ user, token });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { username, password, captchaToken } = req.body;
        // Verify CAPTCHA is required
        if (!captchaToken) {
            return res.status(400).json({ error: 'CAPTCHA required' });
        }
        // Verify CAPTCHA token
        const isValidCaptcha = await verifyCaptcha(captchaToken);
        if (!isValidCaptcha) {
            return res.status(400).json({ error: 'Invalid CAPTCHA' });
        }
        const user = await database_1.prisma.user.findUnique({
            where: { username },
        });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const isValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({
            user: {
                id: user.id,
                username: user.username,
                publicKey: user.publicKey,
                pfpUrl: user.pfpUrl,
                primaryColor: user.primaryColor,
                secondaryColor: user.secondaryColor,
                createdAt: user.createdAt,
            },
            token,
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
        const user = await database_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                username: true,
                publicKey: true,
                pfpUrl: true,
                primaryColor: true,
                secondaryColor: true,
                createdAt: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// Update username
router.post('/update-username', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
        const { username } = req.body;
        if (!username || username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }
        // Check if username is taken
        const existingUser = await database_1.prisma.user.findUnique({
            where: { username },
        });
        if (existingUser && existingUser.id !== decoded.userId) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        const user = await database_1.prisma.user.update({
            where: { id: decoded.userId },
            data: { username },
            select: {
                id: true,
                username: true,
                publicKey: true,
                pfpUrl: true,
                tokenVersion: true,
                createdAt: true,
            },
        });
        // Generate new token with updated username and tokenVersion
        const newToken = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        // Broadcast username change to all connected clients
        index_1.io.emit('user-updated', { userId: user.id, username: user.username });
        res.json({ user, token: newToken });
    }
    catch (error) {
        console.error('Update username error:', error);
        res.status(500).json({ error: 'Failed to update username' });
    }
});
// Update theme colors
router.post('/update-theme', auth_1.authenticate, async (req, res) => {
    try {
        const { primaryColor, secondaryColor } = req.body;
        const userId = req.userId;
        console.log('Update theme request:', { userId, primaryColor, secondaryColor });
        // Validate color format (hex)
        const hexRegex = /^#[0-9A-Fa-f]{6}$/;
        if (primaryColor && !hexRegex.test(primaryColor)) {
            return res.status(400).json({ error: 'Invalid primary color format' });
        }
        if (secondaryColor && !hexRegex.test(secondaryColor)) {
            return res.status(400).json({ error: 'Invalid secondary color format' });
        }
        const user = await database_1.prisma.user.update({
            where: { id: userId },
            data: {
                ...(primaryColor && { primaryColor }),
                ...(secondaryColor && { secondaryColor }),
            },
            select: {
                id: true,
                username: true,
                publicKey: true,
                pfpUrl: true,
                primaryColor: true,
                secondaryColor: true,
                createdAt: true,
            },
        });
        console.log('Theme updated successfully:', { userId: user.id, primaryColor: user.primaryColor, secondaryColor: user.secondaryColor });
        // Broadcast theme update to all user's connections
        index_1.io.emit('theme-updated', {
            userId: user.id,
            primaryColor: user.primaryColor,
            secondaryColor: user.secondaryColor
        });
        res.json({ user });
    }
    catch (error) {
        console.error('Update theme error:', error);
        res.status(500).json({ error: 'Failed to update theme' });
    }
});
// Verify password for sensitive operations
router.post('/verify-password', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
        const { password } = req.body;
        const user = await database_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { password: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isValid = await bcryptjs_1.default.compare(password, user.password);
        if (isValid) {
            res.json({ success: true });
        }
        else {
            res.status(401).json({ error: 'Invalid password' });
        }
    }
    catch (error) {
        console.error('Verify password error:', error);
        res.status(500).json({ error: 'Failed to verify password' });
    }
});
// Get user by username (public profile)
router.get('/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const currentUserId = req.userId;
        const user = await database_1.prisma.user.findUnique({
            where: { username },
            select: {
                id: true,
                username: true,
                pfpUrl: true,
                publicKey: true,
                createdAt: true,
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Get mutual friends (friends that both users have in common)
        const userFriends = await database_1.prisma.friendship.findMany({
            where: {
                OR: [
                    { userId: user.id },
                    { friendId: user.id }
                ]
            },
            include: {
                user: { select: { id: true, username: true, pfpUrl: true } },
                friend: { select: { id: true, username: true, pfpUrl: true } }
            }
        });
        const currentUserFriends = await database_1.prisma.friendship.findMany({
            where: {
                OR: [
                    { userId: currentUserId },
                    { friendId: currentUserId }
                ]
            }
        });
        const currentUserFriendIds = new Set([
            ...currentUserFriends.map((f) => f.userId === currentUserId ? f.friendId : f.userId)
        ]);
        const mutualFriends = userFriends
            .map((f) => f.userId === user.id ? f.friend : f.user)
            .filter((f) => currentUserFriendIds.has(f.id));
        // Get mutual groups (groups that both users are in)
        const userGroups = await database_1.prisma.room.findMany({
            where: {
                type: 'GROUP',
                members: { some: { userId: user.id } }
            },
            select: { id: true, name: true, groupImage: true }
        });
        const currentUserGroups = await database_1.prisma.room.findMany({
            where: {
                type: 'GROUP',
                members: { some: { userId: currentUserId } }
            },
            select: { id: true }
        });
        const currentUserGroupIds = new Set(currentUserGroups.map(g => g.id));
        const mutualGroups = userGroups.filter(g => currentUserGroupIds.has(g.id));
        res.json({
            user,
            mutualFriends,
            mutualGroups
        });
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});
// Reset password - changes password and invalidates ALL existing sessions
router.post('/reset-password', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.slice(7);
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
        }
        catch {
            return res.status(401).json({ error: 'Invalid token' });
        }
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        // Increment tokenVersion to invalidate all existing tokens
        await database_1.prisma.user.update({
            where: { id: decoded.userId },
            data: {
                password: hashedPassword,
                tokenVersion: { increment: 1 }
            }
        });
        // Revoke the current token so it can't be used again
        await database_1.prisma.revokedToken.create({
            data: {
                token,
                userId: decoded.userId
            }
        });
        // Emit logout event to all user's connections to force re-auth
        index_1.io.emit('force-logout', { userId: decoded.userId });
        // Return success WITHOUT a new token - user must log in again
        res.json({ success: true, message: 'Password reset successful. Please log in again.' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});
