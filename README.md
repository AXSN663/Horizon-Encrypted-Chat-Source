# Horizon Chat - Complete Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL (or SQLite for testing)
- npm or yarn
- Git

## Installation Steps

### Step 1: Clone the repository
```bash
git clone <repository-url>
cd Chat
```

### Step 2: Install all dependencies
```bash
npm install
```

### Step 3: Setup environment variables
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
# Database (PostgreSQL recommended for production)
DATABASE_URL="postgresql://user:password@localhost:5432/horizon_chat?schema=public"

# Server
PORT=4000
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
CLIENT_URL="http://localhost:3000"

# Cloudflare Turnstile (optional, for CAPTCHA)
TURNSTILE_SECRET_KEY=""
```

### Step 4: Generate Prisma client
```bash
npm run db:generate
```

### Step 5: Build database package
```bash
cd packages/database
npm run build
cd ../..
```

### Step 6: Run database migrations
```bash
npm run db:migrate
```

### Step 7: Build shared package
```bash
cd packages/shared
npm run build
cd ../..
```

### Step 8: Create uploads directories
```bash
mkdir -p apps/server/uploads/Pictures
mkdir -p apps/server/uploads/Files
mkdir -p apps/server/uploads/pfps
mkdir -p apps/server/uploads/groups
mkdir -p apps/server/uploads/temp
```

## Development

### Start all services (recommended)
```bash
npm run dev
```

### Or start individually

**Terminal 1 - Backend:**
```bash
cd apps/server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd apps/web
npm run dev
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## Production Deployment

### 1. Set production environment variables
```env
DATABASE_URL="postgresql://user:password@localhost:5432/horizon_chat?schema=public"
JWT_SECRET="strong-random-secret-min-32-characters-long"
CLIENT_URL="https://yourdomain.com"
PORT=4000
TURNSTILE_SECRET_KEY="your-cloudflare-turnstile-secret"
```

### 2. Build everything
```bash
npm run build
```

### 3. Start production server
```bash
npm start
```

## Cloudflare Tunnel Setup (Recommended for Production)

### Prerequisites: Cloudflare Domain Setup

**Before starting, you need:**
1. A domain name (e.g., yourdomain.com)
2. Domain DNS managed by Cloudflare (nameservers pointing to Cloudflare)

**To add domain to Cloudflare:**
1. Go to https://dash.cloudflare.com
2. Click "Add a Site"
3. Enter your domain name
4. Select the free plan
5. Cloudflare will scan existing DNS records
6. Copy the Cloudflare nameservers provided
7. Go to your domain registrar (where you bought the domain)
8. Change the nameservers to Cloudflare's
9. Wait 5-60 minutes for DNS propagation
10. Return to Cloudflare and click "Done, check nameservers"

### Step 1: Install cloudflared

**On Debian/Ubuntu:**
```bash
# Add Cloudflare's official GPG key
wget -q https://pkg.cloudflare.com/cloudflare-main.gpg -O /usr/share/keyrings/cloudflare-main.gpg

# Add Cloudflare's apt repository
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | tee /etc/apt/sources.list.d/cloudflared.list

# Install cloudflared
apt-get update && apt-get install -y cloudflared
```

**On Windows:**
Download from: https://github.com/cloudflare/cloudflared/releases/latest
Extract and add to PATH.

### Step 2: Authenticate with Cloudflare
```bash
cloudflared tunnel login
```
This will open a browser to authenticate. Select the domain you want to use.

### Step 3: Create the tunnel
```bash
cloudflared tunnel create horizon-chat
```
This outputs your tunnel ID (save it).

### Step 4: Create DNS records in Cloudflare Dashboard

**To access DNS settings:**
1. Go to https://dash.cloudflare.com
2. Select your domain
3. Click "DNS" in the left sidebar
4. Click "Add record"

**Create these 2 records:**

| Type | Name | Target | Proxy Status |
|------|------|--------|--------------|
| CNAME | @ | `<your-tunnel-id>.cfargotunnel.com` | Proxied (orange cloud) |
| CNAME | api | `<your-tunnel-id>.cfargotunnel.com` | Proxied (orange cloud) |

**Steps for each record:**
1. Type: Select "CNAME"
2. Name: Enter `@` for root domain or `api` for subdomain
3. Target: Enter your tunnel ID followed by `.cfargotunnel.com`
4. Proxy status: Toggle to ON (orange cloud icon)
5. TTL: Leave as Auto
6. Click "Save"

**Verify records:**
- `yourdomain.com` should resolve to your tunnel
- `api.yourdomain.com` should resolve to your tunnel

### Step 5: Configure cloudflared

Create config file at `~/.cloudflared/config.yml` (Linux) or `%USERPROFILE%\.cloudflared\config.yml` (Windows):

```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json

ingress:
  # API backend
  - hostname: api.yourdomain.com
    service: http://localhost:4000
  
  # Web frontend
  - hostname: yourdomain.com
    service: http://localhost:3000
  
  # Default catch-all
  - service: http_status:404
```

### Step 6: Update environment variables

Edit `.env`:
```env
CLIENT_URL="https://yourdomain.com"
```

### Step 7: Run the tunnel

**Manual run:**
```bash
cloudflared tunnel run horizon-chat
```

**Run as a service (Linux):**
```bash
# Install as systemd service
cloudflared service install

# Start the service
systemctl start cloudflared

# Enable auto-start on boot
systemctl enable cloudflared
```

**Check tunnel status:**
```bash
cloudflared tunnel info horizon-chat
```

## Database Management

### Open Prisma Studio (GUI)
```bash
npm run db:studio
```

### Reset database (WARNING: deletes all data)
```bash
cd packages/database
npx prisma migrate reset
```

### Clean all data (for selling/distribution)
```bash
node cleanup-database.js
```

## Troubleshooting

### "Cannot find module '@chat/database'"
Run: `cd packages/database && npm run build`

### "Cannot find module '@chat/shared'"
Run: `cd packages/shared && npm run build`

### Database connection errors
- Check PostgreSQL is running
- Verify DATABASE_URL in `.env`
- Ensure database exists

### Port already in use
- Change PORT in `.env` or kill existing process

## Features

- End-to-end encrypted messaging (AES-GCM-256)
- Self-destructing messages
- File uploads with encryption
- Group chats
- Real-time notifications via Socket.IO
- Voice messages
- Custom themes
- Profile pictures
- Friend system

## Security Notes

- Change default JWT_SECRET in production (min 32 chars)
- Use strong database passwords
- Enable HTTPS in production
- Set up proper CORS origins
- Keep your private keys secure (stored in browser localStorage)
