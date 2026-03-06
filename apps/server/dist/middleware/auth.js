"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("@chat/database");
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        // Check if token is in the revoked list
        const revokedToken = await database_1.prisma.revokedToken.findUnique({
            where: { token }
        });
        if (revokedToken) {
            return res.status(401).json({ error: 'Token revoked. Please log in again.' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
        // Check if token version matches current user token version
        const user = await database_1.prisma.user.findUnique({
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
        req.userId = decoded.userId;
        req.token = token;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
exports.authenticate = authenticate;
