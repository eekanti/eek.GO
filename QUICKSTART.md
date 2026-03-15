# 🚀 Quick Start Guide - AI Coding Agents on Plexie

This is your **5-minute quick start** to get the multi-agent system running. For detailed instructions, see `README.md` and `docs/Plexie Server Setup Guide.md`.

## Prerequisites Checklist

Before starting, verify:

- [ ] Ubuntu server (Plexie) with root/sudo access
- [ ] LM Studio installed at IP: `10.0.0.100` on port `1234`
- [ ] Model loaded in LM Studio (e.g., mistral-7b-instruct-v0.2)

## 5-Minute Deployment

### Step 1: Install Docker & Clone Repo (2 minutes)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone repository
git clone https://github.com/eekanti/n8n-team.git
cd n8n-team

# Copy env template and edit it
cp .env.example .env
nano .env  # Edit DOMAIN_NAME, LOCAL_AI_MODEL, URLs
```

### Step 2: Deploy with Docker Compose (1 minute)

```bash
# Start all services
docker-compose up -d

# Verify they're running
docker ps
```

You should see `plexie-n8n` and `plexie-redis` containers in "Up" state.

### Step 3: Access n8n & Configure (2 minutes)

1. Open browser: http://localhost:5678
2. Create admin account when prompted
3. Go to **Settings** → **Credentials**
4. Click **"Add Credential"** → Select **"OpenAI API"**
5. Fill in:
   - **Base URL**: `http://10.0.0.100:1234/v1`
   - **API Key**: `local-key` (any value)
6. Save as "LM Studio Local LLM"

### Step 4: Import First Agent Workflow (5 minutes)

1. Click **"Create Workflow"** → **"Import from URL"**
2. Paste content from [workflows/01-Planner-Agent.json](https://raw.githubusercontent.com/eekanti/n8n-team/main/workflows/01-Planner-Agent.json)
3. Name it "Planner Agent"
4. Click the LLM node in workflow and select your "LM Studio Local LLM" credential
5. Click **"Execute Workflow"** to test

## Testing Your Setup

### Test Planner Agent (Quick Check)

In the Manual Trigger node:
```json
{
  "message": "Create a user authentication API with login and registration endpoints"
}
```

You should see structured tasks output in JSON format.

### Test LM Studio Connection

Run this command from Plexie server terminal:
```bash
curl http://10.0.0.100:1234/v1/models
```

Expected response (example):
```json
{
  "data": [
    {
      "id": "mistral-7b-instruct-v0.2",
      "object": "model"
    }
  ]
}
```

If you get connection refused error:
1. Verify LM Studio server is running (check Server tab)
2. Check firewall allows port 1234 traffic
3. Verify IP address `10.0.0.100` is correct

## Import All Agent Workflows

Import these in order (each takes ~1 minute):

| Workflow | File | Purpose |
|----------|------|---------|
| **Planner** | [workflows/01-Planner-Agent.json](https://raw.githubusercontent.com/eekanti/n8n-team/main/workflows/01-Planner-Agent.json) | Breaks down natural language requests into tasks |
| **Code Writer** | [workflows/02-Code-Writer-Agent.json](https://raw.githubusercontent.com/eekanti/n8n-team/main/workflows/02-Code-Writer-Agent.json) | Generates production-ready code |
| **Security Reviewer** | [workflows/03-Security-Reviewer-Agent.json](https://raw.githubusercontent.com/eekanti/n8n-team/main/workflows/03-Security-Reviewer-Agent.json) | Checks for OWASP vulnerabilities |
| **Quality Reviewer** | [workflows/04-Quality-Reviewer-Agent.json](https://raw.githubusercontent.com/eekanti/n8n-team/main/workflows/04-Quality-Reviewer-Agent.json) | Evaluates documentation and tests |

After importing each:
1. Select the LLM node
2. Choose your "LM Studio Local LLM" credential
3. Execute workflow to verify it works

## Connecting Agents Together (Optional Advanced Step)

Once individual agents work, create a master workflow that chains them:

```
Manual Trigger → Planner Agent → Code Writer Agent → Security Reviewer → Quality Reviewer → Output
```

See [README.md](https://github.com/eekanti/n8n-team/blob/main/README.md#-connect-agents-together-full-multi-agent-workflow) for the complete structure.

## Common Issues & Quick Fixes

| Issue | Quick Fix |
|-------|-----------|
| "LM Studio connection failed" | Check LM Server tab, run `curl http://10.0.0.100:1234/v1/models` |
| "No nodes available in picker" | Wait 30 seconds for community packages to load on startup |
| "n8n container won't start" | Check logs with `docker-compose logs -f n8n`, verify disk space |
| "Credential not found" | Create OpenAI API credential first (Settings → Credentials) |

## Next Steps After Setup

1. ✅ **Test each agent individually** using the test instructions above
2. 📝 **Customize prompts** to match your exact stack preferences (edit system messages in LLM nodes)
3. 🔗 **Connect agents together** in a master workflow for full multi-agent operation
4. 🎯 **Add MCP servers** for documentation research if desired

## Useful Commands

```bash
# View n8n logs
docker-compose logs -f n8n

# Restart all services
docker-compose restart

# Stop all services
docker-compose down

# Start all services again
docker-compose up -d

# Check service health
curl http://localhost:5678/healthz
```

## Need More Help?

- 📖 **Full Documentation**: [README.md](https://github.com/eekanti/n8n-team/blob/main/README.md)
- 🔧 **Server-Specific Setup**: [docs/Plexie Server Setup Guide.md](https://github.com/eekanti/n8n-team/blob/main/docs/Plexie%20Server%20Setup%20Guide.md)
- 📚 **Prompt Templates**: Check `docs/` folder for customization guides

---

**You're all set!** Your multi-agent coding system is now running on Plexie with a local LLM. Start by testing the Planner Agent, then move on to building out your full workflow! 🎉
