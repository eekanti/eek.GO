# Plexie Server Setup Guide for AI Coding Agents

This guide provides server-specific instructions for deploying the multi-agent system on your Ubuntu server named "Plexie".

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] Ubuntu 20.04+ installed on Plexie server
- [ ] Root or sudo access to install Docker and dependencies
- [ ] LM Studio installed on a separate machine at IP `10.0.0.100` (or same machine)
- [ ] Port 5678 available for n8n web interface
- [ ] Port 1234 accessible from Plexie to LM Studio server

## Server Configuration Steps

### Step 1: Install Docker and Docker Compose

```bash
# Update package index
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group (optional, for easier access)
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker compose version  # or docker-compose if using standalone
```

### Step 2: Clone Repository and Configure

```bash
# Create project directory
mkdir -p /root/ai-coding-agents && cd /root/ai-coding-agents

# Clone repository
git clone https://github.com/eekanti/n8n-team.git .

# Copy environment template
cp .env.example .env
nano .env
```

**Edit `.env` file with these values:**

| Variable | Your Value | Notes |
|----------|------------|-------|
| `DOMAIN_NAME` | plexie.yourdomain.com or localhost | Server domain/IP |
| `N8N_EDITOR_BASE_URL` | https://plexie.yourdomain.com | Must match DOMAIN_NAME |
| `WEBHOOK_URL` | https://plexie.yourdomain.com | Same as above |
| `LOCAL_AI_MODEL` | mistral-7b-instruct-v0.2 | Exact name from LM Studio |

### Step 3: Start Services

```bash
# Navigate to project directory
cd /root/ai-coding-agents

# Start all containers in detached mode
docker-compose up -d

# Verify services are running
docker ps

# View logs (optional, for troubleshooting)
docker-compose logs -f n8n
```

### Step 4: Access n8n Interface

Open your browser and navigate to:
```
http://localhost:5678
```

Or if using a custom domain:
```
https://plexie.yourdomain.com:5678
```

Create an admin account when prompted.

## LM Studio Configuration (Critical!)

Your local LLM runs at `10.0.0.100:1234`. Follow these steps to ensure it's properly configured:

### 1. Install LM Studio on Target Machine

Download from [https://lmstudio.ai](https://lmstudio.ai) and install.

### 2. Load a Code-Optimized Model

In LM Studio, go to the **Model** tab and load one of these recommended models:
- `mistral-7b-instruct-v0.2` (best balance for most use cases)
- `llama-3.1-8b-instruct` (better reasoning, requires more RAM)
- `codellama-13b-instruct` (excellent for code generation, needs 16GB+ RAM)

### 3. Start Local Server

1. Click the **"Server"** tab in LM Studio
2. Select your loaded model from dropdown
3. Click **"Start Server"**
4. Note the port number (default is 1234)

### 4. Verify Connection

From Plexie server, run:
```bash
curl http://10.0.0.100:1234/v1/models
```

You should see a JSON response listing your loaded model(s). Copy the exact name from this response and update `.env`:
```bash
LOCAL_AI_MODEL=your-exact-model-name-here
```

### 5. Configure n8n Credential

In n8n web interface:
1. Go to **Settings** → **Credentials**
2. Click **"Add Credential"**
3. Select **"OpenAI API"** (LM Studio uses OpenAI-compatible endpoint)
4. Fill in:
   - **Base URL**: `http://10.0.0.100:1234/v1`
   - **API Key**: `local-key` (any value, local servers don't require auth)
5. Save and name it "LM Studio Local LLM"

## Firewall Configuration

If you're using a firewall on Plexie server, ensure these ports are open:

```bash
# Allow n8n web interface
sudo ufw allow 5678/tcp

# If using HTTPS with custom domain, also allow:
sudo ufw allow 443/tcp

# Enable firewall (if not already enabled)
sudo ufw enable
```

## Docker Data Persistence

All data is stored in `/docker/appdata/`:

- **n8n workflows and database**: `/docker/appdata/n8n/data`
- **n8n uploaded files**: `/docker/appdata/n8n/local-files`
- **Redis cache**: `/docker/appdata/redis/data`

**Backup these directories regularly!**

## Monitoring and Maintenance

### View n8n Logs

```bash
# Live logs
docker-compose logs -f n8n

# Last 100 lines only (no follow)
docker-compose logs --tail=100 n8n
```

### Check Service Health

```bash
# View all container status
docker ps

# Check if n8n is responding
curl http://localhost:5678/healthz
```

### Restart Services

```bash
# Restart only n8n (keeps Redis running)
docker-compose restart n8n

# Restart everything
docker-compose restart

# Stop all services
docker-compose down

# Start all services again
docker-compose up -d
```

### Update to Latest Version

```bash
cd /root/ai-coding-agents
git pull origin main
docker-compose pull
docker-compose up -d --force-recreate
```

## Troubleshooting Common Issues

### Issue: "Failed to connect to LM Studio"

**Symptoms**: n8n workflows fail with connection errors when calling LLM nodes.

**Solutions**:
1. Verify LM Studio server is running (check the Server tab in LM Studio)
2. Test manual connectivity from Plexie:
   ```bash
   curl http://10.0.0.100:1234/v1/models
   ```
3. Check firewall rules on both machines allow port 1234 traffic
4. Verify .env file has correct LOCAL_AI_BASE_URL

### Issue: "n8n container won't start"

**Symptoms**: `docker ps` shows n8n in restarting state repeatedly.

**Solutions**:
```bash
# Check detailed logs
docker-compose logs -f n8n | grep -i error

# Try rebuilding from scratch (WARNING: deletes all data!)
sudo rm -rf /docker/appdata/n8n/data/*
docker-compose up -d

# If still failing, check disk space and memory on Plexie server
df -h
free -m
```

### Issue: "Community packages not loaded"

**Symptoms**: LangChain nodes don't appear in node picker.

**Solutions**:
1. Verify environment variable is set correctly in .env file:
   ```bash
   N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
   ```
2. Restart n8n container after changing env vars:
   ```bash
   docker-compose restart n8n
   ```
3. Wait 30-60 seconds for community packages to load on startup

### Issue: "LM Studio model name doesn't match"

**Symptoms**: LLM node throws error about invalid model name.

**Solutions**:
1. In LM Studio, go to Server tab and note the exact model name shown
2. Visit `http://10.0.0.100:1234/v1/models` in browser on Plexie server
3. Copy the exact name from the JSON response (including version numbers if present)
4. Update .env file with this exact value

## Performance Optimization Tips

### 1. Enable Redis for Better Performance

If you have extra RAM, Redis will significantly improve performance:

```bash
# The redis service is already configured in docker-compose.yml
# Just ensure it starts properly:
docker-compose up -d redis
```

### 2. Increase Memory Allocation (if running out)

Edit `docker-compose.yml` to add memory limits for n8n container:

```yaml
services:
  n8n:
    deploy:
      resources:
        limits:
          memory: 4G
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

### 3. Use SSD for Data Directories (if possible)

For better I/O performance, consider using an SSD mount point:

```bash
# Create symlink to SSD storage
sudo mkdir -p /mnt/ssd/n8n-data
cp -r /docker/appdata/n8n/data/* /mnt/ssd/n8n-data/
rm -rf /docker/appdata/n8n/data
ln -s /mnt/ssd/n8n-data /docker/appdata/n8n/data
```

## Security Recommendations for Production

### 1. Use HTTPS with SSL Certificate

If deploying publicly accessible:

```bash
# Install certbot and get free SSL certificate
sudo apt install certbot python3-certbot-nginx

# Get certificate (replace YOUR_DOMAIN with your actual domain)
sudo certbot --nginx -d plexie.yourdomain.com

# Update n8n environment variables in .env:
N8N_PROTOCOL=https
DOMAIN_NAME=plexie.yourdomain.com
```

### 2. Enable Basic Authentication for n8n

Edit `docker-compose.yml` and add authentication credentials:

```yaml
environment:
  - N8N_BASIC_AUTH_ACTIVE=true
  - N8N_BASIC_AUTH_USER=admin
  - N8N_BASIC_AUTH_PASSWORD=your-strong-password-here
```

### 3. Restrict Network Access (if possible)

Use Docker network isolation to restrict access:

```yaml
services:
  n8n:
    networks:
      - internal_n8n_network
    ports:
      - "127.0.0.1:5678:5678"  # Only localhost can access
```

## Backup Strategy

### Automated Daily Backups (Recommended)

Create a backup script at `/root/backup-n8n.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/root/n8n-backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup n8n data and Redis
docker cp plexie-n8n:/home/node/.n8n /backup-temp-n8n/
docker cp plexie-redis:/data /backup-temp-redis/

tar -czf $BACKUP_DIR/n8n-backup_$DATE.tar.gz /backup-temp-n8n /backup-temp-redis

# Clean up temp directory
rm -rf /backup-temp-n8n /backup-temp-redis

echo "Backup completed: n8n-backup_$DATE.tar.gz"
```

Make it executable and add to cron:

```bash
chmod +x /root/backup-n8n.sh
crontab -e
# Add this line for daily backup at 2 AM:
0 2 * * * /root/backup-n8n.sh
```

### Manual Backup Command

For quick manual backups:

```bash
docker exec plexie-n8n tar czf /tmp/n8n-backup.tar.gz -C /home/node .n8n
docker cp plexie-redis:/data /tmp/redis-backup-data/
tar -czf n8n-full-backup.tar.gz /tmp/n8n-backup.tar.gz /tmp/redis-backup-data
```

## Next Steps After Deployment

1. ✅ **Test LM Studio connection** using the curl command above
2. ✅ **Import individual agent workflows** from the `workflows/` directory
3. ✅ **Configure each workflow's LLM node** to use your "LM Studio Local LLM" credential
4. ✅ **Test each agent independently** before connecting them together
5. ✅ **Create a master workflow** that connects all agents (see documentation for structure)

---

**Need help?** Check the main `README.md` for more detailed instructions on configuring individual agents and customizing prompts to match your exact requirements!
