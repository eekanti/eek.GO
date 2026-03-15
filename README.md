# 🤖 AI Coding Agents - Multi-Agent System

A complete multi-agent coding assistant system running on your local Linux server (Plexie) using **LM Studio** for the local LLM. This system includes specialized agents that work together to plan, write, review, and deploy code.

## 🎯 What You Get

| Agent | Purpose |
|-------|---------|
| **Planner Agent** | Breaks down natural language requests into structured tasks with dependencies |
| **Code Writer Agent** | Generates production-ready TypeScript/JavaScript/Python code following your stack preferences |
| **Security Reviewer Agent** | Reviews code for OWASP Top 10 vulnerabilities and security best practices |
| **Quality Reviewer Agent** | Evaluates documentation coverage, test completeness, and architectural decisions |
| **Error Logger Agent** | Logs errors to Obsidian vault or other destinations for tracking |

## 🚀 Quick Start (5 Minutes)

### Step 1: Clone the Repository

```bash
git clone https://github.com/eekanti/n8n-team.git
cd n8n-team
```

### Step 2: Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

**Important changes needed:**
- `DOMAIN_NAME`: Your server's domain or IP address
- `LOCAL_AI_MODEL`: The exact model name loaded in LM Studio (see below)
- `N8N_EDITOR_BASE_URL` and `WEBHOOK_URL`: Set to your actual domain

### Step 3: Deploy with Docker Compose

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

The script will automatically:
1. Install Docker if needed
2. Clone the repository
3. Create data directories for persistence
4. Start n8n and Redis containers
5. Wait for services to initialize

### Step 4: Access n8n

Open your browser and navigate to:
```
http://localhost:5678
```

## 🔧 LM Studio Configuration (Required!)

Your local LLM runs on **10.0.0.100:1234**. Here's how to configure it properly:

### 1. Install and Start LM Studio

Download from [https://lmstudio.ai](https://lmstudio.ai) and install on your server.

### 2. Load a Model

In LM Studio, go to the **Model** tab and load a suitable model for code generation:
- **Recommended**: `mistral-7b-instruct-v0.2` (good balance of speed/quality)
- **Alternative**: `llama-3.1-8b-instruct` (better reasoning)
- **For larger models**: `codellama-13b-instruct` if you have the RAM

### 3. Start Local Server

Click **"Start Server"** in LM Studio and ensure it's running on port `1234`.

### 4. Verify Model Name

In your browser, visit:
```
http://10.0.0.100:1234/v1/models
```

You should see a list of loaded models. Copy the **exact name** from this response and update `.env`:
```bash
LOCAL_AI_MODEL=mistral-7b-instruct-v0.2  # Replace with your actual model name
```

### 5. Update n8n Credentials

In n8n, go to **Settings → Credentials**:
1. Click **"Add Credential"**
2. Select **"LM Studio OpenAI Compatible API"** (or create a custom credential)
3. Enter:
   - **Base URL**: `http://10.0.0.100:1234/v1`
   - **API Key**: Any value (local servers typically don't require authentication)
4. Save and name it "LM Studio Local LLM"

## 📥 Import Workflows

Each agent is a separate workflow. Import them in this order:

### 1. Import Planner Agent

1. In n8n, click **"Create Workflow"** → **"Import from URL"** (or copy-paste JSON)
2. Use the file `workflows/01-Planner-Agent.json`
3. Name it "Planner Agent"

### 2. Import Code Writer Agent

1. Create new workflow
2. Use the file `workflows/02-Code-Writer-Agent.json`
3. Name it "Code Writer Agent"
4. **Important**: Ensure the OpenAI node uses your LM Studio credential

### 3. Import Security Reviewer Agent

1. Create new workflow
2. Use the file `workflows/03-Security-Reviewer-Agent.json`
3. Name it "Security Reviewer Agent"

### 4. Import Quality Reviewer Agent

1. Create new workflow
2. Use the file `workflows/04-Quality-Reviewer-Agent.json`
3. Name it "Quality Reviewer Agent"

### 5. Import Error Logger Agent (Optional)

1. Create new workflow
2. Use the file `workflows/05-Error-Logger-Agent.json`
3. Name it "Error Logger Agent"

## 🧪 Test Your Agents Individually

Before connecting them together, test each agent:

### Planner Agent Test

1. Open the Planner Agent workflow
2. Click **"Execute Workflow"**
3. In the Manual Trigger node, enter a message like:
   ```
   Create a user authentication API with login and registration endpoints
   ```
4. Check the output - you should see structured tasks in JSON format

### Code Writer Agent Test

1. Open the Code Writer Agent workflow
2. Click **"Execute Workflow"**
3. In the input node, enter:
   ```json
   {
     "task": {
       "description": "Create Express.js login endpoint with JWT authentication"
     }
   }
   ```
4. Check output - should include complete code with JSDoc comments

### Security Reviewer Test

1. Open the Security Reviewer Agent workflow
2. In the input node, paste sample insecure code:
   ```javascript
   app.post('/login', (req, res) => {
     const { username, password } = req.body;
     // No validation!
     const user = db.query('SELECT * FROM users WHERE username = ' + username);
     if (user.password === password) {
       res.json({ success: true });
     }
   });
   ```
3. Check output - should flag multiple security issues

## 🔗 Connect Agents Together (Full Multi-Agent Workflow)

Once individual agents work, create a master workflow that connects them:

```
Manual Trigger → Planner Agent → Code Writer Agent → Security Reviewer Agent → Quality Reviewer Agent → Output
```

### Example Master Workflow Structure

1. **Node 1**: Manual Trigger - User enters natural language request
2. **Node 2**: HTTP Request (Planner Agent) - Calls the Planner workflow
3. **Node 3**: Code Writer Agent - For each task, generates code
4. **Node 4**: Security Reviewer Agent - Reviews generated code
5. **Node 5**: Quality Reviewer Agent - Checks documentation and tests
6. **Node 6**: Output Node - Final result with all review feedback

## 📊 Customization Guide

### Update Tech Stack Preferences

All agent prompts are customized to your stack. To modify them:

1. Open the relevant workflow in n8n editor
2. Find the **"System Message"** or **"Prompt Template"** field in each LLM node
3. Edit the prompt text directly (see `docs/Custom System Prompts by Tech Stack.md` for templates)

### Add Project-Specific Rules

To add rules for specific project types:

1. Open your Code Writer Agent workflow
2. Find the system message section
3. Add a new subsection like this:

```markdown
Additional Requirements:
- Payment integration using Stripe (never store credit card data)
- Inventory tracking with optimistic locking to prevent overselling
- Order status workflow with state machine pattern
```

### Adjust Agent Behavior

You can control how creative each agent is by adjusting the **temperature** parameter in each LLM node:

| Agent | Recommended Temperature | Effect |
|-------|------------------------|--------|
| Planner | 0.3 | More structured, deterministic output |
| Code Writer | 0.7 | Balanced creativity and following instructions |
| Security Reviewer | 0.3 | Conservative, catches more issues |
| Quality Reviewer | 0.5 | Balanced assessment |

## 🐛 Troubleshooting

### LM Studio Connection Fails

**Error**: `Failed to connect to http://10.0.0.100:1234/v1`

**Solutions**:
1. Verify LM Studio server is running (check the "Server" tab in LM Studio)
2. Test connection manually: `curl http://10.0.0.100:1234/v1/models`
3. Ensure firewall allows traffic on port 1234
4. Check .env file has correct LOCAL_AI_BASE_URL

### n8n Won't Start

**Error**: Container fails to start or keeps restarting

**Solutions**:
```bash
# View logs
docker-compose logs -f n8n

# Restart services
docker-compose restart

# Rebuild from scratch (WARNING: deletes all data!)
docker-compose down
rm -rf /docker/appdata/n8n/data/*
docker-compose up -d
```

### Community Packages Not Available

**Error**: "Community packages not loaded" or missing LangChain nodes

**Solutions**:
1. Check environment variable is set: `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`
2. Restart n8n container after changing env vars
3. Wait 30 seconds for community packages to load on startup

### Agent Outputs Don't Match Expectations

**Symptoms**: Code generated doesn't follow your stack preferences or review feedback is too lenient

**Solutions**:
1. Increase temperature slightly (0.7 → 0.8) for more creative outputs
2. Add more specific rules to the system prompts in each agent's LLM node
3. Test with simpler requests first, then gradually increase complexity
4. Use the "Custom System Prompts by Tech Stack.md" document as a reference

## 📁 File Structure

```
n8n-team/
├── docker-compose.yml        # Container configuration for n8n + Redis
├── .env.example              # Environment variables template
├── deploy.sh                 # Automated deployment script
├── README.md                 # This file
├── QUICKSTART.md             # 5-minute quick start guide
├── AI_CODING_AGENTS_OVERVIEW.md  # High-level system overview
│
├── docs/                     # Documentation and prompt templates
│   ├── System Architecture Overview.md
│   ├── Plexie Server Setup Guide.md
│   ├── Troubleshooting Guide.md
│   ├── Custom System Prompts by Tech Stack.md
│   ├── System Prompts Reference.md
│   └── Tech Stack Configuration.md
├── workflows/                # Pre-configured agent workflows
│   ├── 01-Planner-Agent.json
│   ├── 02-Code-Writer-Agent.json
│   ├── 03-Security-Reviewer-Agent.json
│   ├── 04-Quality-Reviewer-Agent.json
│   └── 05-Error-Logger-Agent.json
└── .gitignore                # Git ignore rules for project files
```

## 🎯 Next Steps After Deployment

1. **Test each agent individually** using the test instructions above
2. **Customize prompts** to match your exact preferences (edit system messages)
3. **Connect agents together** in a master workflow for full multi-agent operation
4. **Add MCP servers** for documentation research (Context7, etc.) if desired
5. **Set up error logging** integration with Obsidian or other destinations

## 📞 Support & Feedback

If you encounter issues or have suggestions:
- Check the troubleshooting section above first
- Review the n8n logs using `docker-compose logs -f n8n`
- Verify your LM Studio configuration matches requirements
- Test connections manually before blaming the system

---

**Built for Plexie Server with Local LLM Integration** 🚀