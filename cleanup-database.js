#!/usr/bin/env node
/**
 * Database Cleanup Script
 * WARNING: This will permanently delete ALL data!
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const UPLOAD_DIRS = [
  './apps/server/uploads/Pictures',
  './apps/server/uploads/Files',
  './apps/server/uploads/pfps',
  './apps/server/uploads/groups',
  './apps/server/uploads/temp'
];

async function cleanup() {
  console.log('⚠️  WARNING: This will permanently delete ALL data!');
  console.log('Press Ctrl+C within 5 seconds to cancel...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    // Delete in correct order to avoid foreign key constraints
    console.log('🗑️  Deleting messages...');
    await prisma.message.deleteMany({});
    
    console.log('🗑️  Deleting files...');
    await prisma.file.deleteMany({});
    
    console.log('🗑️  Deleting room members...');
    await prisma.roomMember.deleteMany({});
    
    console.log('🗑️  Deleting rooms...');
    await prisma.room.deleteMany({});
    
    console.log('🗑️  Deleting friendships...');
    await prisma.friendship.deleteMany({});
    
    console.log('🗑️  Deleting friend requests...');
    await prisma.friendRequest.deleteMany({});
    
    console.log('🗑️  Deleting users...');
    await prisma.user.deleteMany({});
    
    console.log('✅ Database cleared!\n');
    
    // Delete uploaded files
    console.log('🗑️  Deleting uploaded files...');
    for (const dir of UPLOAD_DIRS) {
      const fullPath = path.resolve(dir);
      if (fs.existsSync(fullPath)) {
        const files = fs.readdirSync(fullPath);
        for (const file of files) {
          const filePath = path.join(fullPath, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`  Deleted: ${file}`);
          } catch (err) {
            console.error(`  Failed to delete: ${file}`, err.message);
          }
        }
        console.log(`✅ Cleared: ${dir} (${files.length} files)`);
      } else {
        console.log(`⏭️  Skipped (not found): ${dir}`);
      }
    }
    
    console.log('\n🎉 All data has been erased!');
    console.log('Database is now empty and ready for new users.');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();

