# 🤖 AI Coding Agents - Complete System Overview

## 🎯 What This Project Does

This project implements a **multi-agent coding system** that uses specialized AI agents to:

1. **Plan** complex coding tasks and break them down into manageable steps
2. **Generate** production-ready code following best practices
3. **Review** for security vulnerabilities (OWASP Top 10 compliance)
4. **Evaluate** code quality, documentation coverage, and test completeness
5. **Log errors** systematically for debugging and improvement

All agents run locally on your server using LM Studio, ensuring:
- ✅ No external API costs or data privacy concerns
- ✅ Full control over model selection and behavior
- ✅ Complete customization of prompts and workflows
- ✅ Offline capability when needed

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites Checklist
- [ ] Ubuntu server with root/sudo access
- [ ] LM Studio installed on same or different machine at IP `10.0.0.100`
- [ ] Model loaded in LM Studio (e.g., mistral-7b-instruct-v0.2)

### Deploy Now
```bash
# 1. Clone and configure
git clone https://github.com/eekanti/n8n-team.git
cd n8n-team
cp .env.example .env
nano .env  # Edit DOMAIN_NAME, LOCAL_AI_MODEL, URLs

# 2. Start services
docker-compose up -d

# 3. Access n8n web interface
open http://localhost:5678
```

**Full setup instructions**: See [README.md](./README.md) or [docs/Plexie Server Setup Guide.md](./docs/Plexie%20Server%20Setup%20Guide.md)

---

## 🧠 The Four Specialized Agents

### 1️⃣ Planner Agent (01-Planner-Agent.json)
**Purpose**: Transform natural language requests into structured, executable tasks.

**Example Input**:  
`"Create a user authentication API with login and registration endpoints"`

**Output Format**:
```json
[
  {
    "task_id": "TASK-001",
    "description": "Design database schema for users table",
    "dependencies": [],
    "complexity": "low"
  },
  {
    "task_id": "TASK-002", 
    "description": "Create Express.js login endpoint with JWT authentication",
    "dependencies": ["TASK-001"],
    "complexity": "medium"
  }
]
```

**Key Features**:
- ✅ Task decomposition using Chain-of-Thought prompting
- ✅ Dependency tracking between tasks
- ✅ Complexity estimation (low/medium/high)
- ✅ JSON output for programmatic consumption

---

### 2️⃣ Code Writer Agent (02-Code-Writer-Agent.json)
**Purpose**: Generate production-ready code following defined tech stack and security standards.

**Tech Stack Configuration**:
- **Languages**: TypeScript (strict mode), JavaScript, JSX
- **Backend Framework**: Node.js with Express.js or Fastify
- **Frontend Framework**: React with hooks (functional components)
- **API Style**: REST APIs with JSON payloads
- **Database**: PostgreSQL (Prisma ORM) or MongoDB (Mongoose)

**Security Requirements**:
- ✅ Input validation before processing
- ✅ JWT authentication (24-hour expiry)
- ✅ Password hashing with bcrypt (salt rounds >= 10)
- ✅ Rate limiting on public endpoints
- ✅ CORS configured for known origins only
- ✅ No sensitive data in logs/errors

**Output Includes**:
- Complete file content with all imports at top
- JSDoc/Docstring documentation for all public functions
- Design decisions explanation
- Testing instructions (how to run tests)
- Environment variable requirements

---

### 3️⃣ Security Reviewer Agent (03-Security-Reviewer-Agent.json)
**Purpose**: Identify security vulnerabilities following OWASP Top 10 guidelines.

**Review Checklist**:
- ✅ All user inputs validated with schema validation before processing
- ✅ No raw SQL queries without parameterization
- ✅ JWT secrets stored in environment variables, never hardcoded
- ✅ Password hashing uses bcrypt or Argon2 (never plain text storage)
- ✅ Rate limiting applied to all auth endpoints and search APIs
- ✅ CORS configuration restricts to known domains only
- ✅ No sensitive data (PII, credentials) logged or returned in responses
- ✅ Dependencies checked for known vulnerabilities (npm audit compliant)
- ✅ Error messages don't leak stack traces or internal details

**Output Format**:
```json
{
  "security_score": 7,
  "critical_issues": [
    {
      "issue": "Password stored as plain text",
      "severity": "high",
      "fix": "Use bcrypt.hash(password, saltRounds=10) before storing"
    }
  ],
  "high_priority": [],
  "recommendations": ["Add rate limiting to prevent brute force attacks"]
}
```

---

### 4️⃣ Quality Reviewer Agent (04-Quality-Reviewer-Agent.json)
**Purpose**: Evaluate code quality, documentation coverage, and maintainability.

**Review Checklist**:
- ✅ All public functions/classes have JSDoc/Docstring comments
- ✅ Unit tests cover critical paths (minimum 80% line coverage)
- ✅ Error handling with custom error types
- ✅ Database queries optimized (no N+1 problems, indexes on foreign keys)
- ✅ Configuration externalized via environment variables
- ✅ Structured logging for debugging
- ✅ API endpoints follow REST conventions properly
- ✅ React components use hooks correctly with no memory leaks

**Output Format**:
```json
{
  "quality_score": 8,
  "strengths": [
    "Comprehensive JSDoc documentation on all public methods",
    "Proper error handling with custom Error classes"
  ],
  "areas_for_improvement": [
    {
      "area": "Test Coverage",
      "current_state": "Only 60% line coverage achieved",
      "target": "Minimum 80% line coverage required",
      "fix": "Add integration tests for API endpoints"
    }
  ],
  "recommendations": ["Consider adding TypeScript strict mode configuration"]
}
```

---

## 🏗️ System Architecture

### High-Level Flow Diagram
```
User Request → Planner Agent → Task List Generation
    ↓
For each task in list:
    ↓
Code Writer Agent → Code Generation + Documentation
    ↓
Security Reviewer Agent → Vulnerability Check
    ↓
Quality Reviewer Agent → Quality Assessment
    ↓
Aggregate Results → Output to User
```

### Infrastructure Components
- **n8n**: Workflow orchestration engine (Port 5678)
- **Redis**: Session state and caching layer (internal port 6379)
- **LM Studio Local LLM**: AI model server at IP `10.0.0.100`, Port `1234`

**Complete architecture details**: See [docs/System Architecture Overview.md](./docs/System%20Architecture%20Overview.md)

---

## 📦 What's Included in This Repository

### Core Files
| File | Purpose |
|------|---------|
| **README.md** | Complete project documentation with overview and setup instructions |
| **QUICKSTART.md** | 5-minute quick start guide for rapid deployment |
| **docker-compose.yml** | Docker Compose configuration for multi-container deployment |
| **.env.example** | Environment variable template to copy and customize |

### Documentation (docs/)
| Document | Purpose |
|----------|---------|
| **System Architecture Overview.md** | Complete system architecture, component breakdowns, data flow diagrams |
| **Plexie Server Setup Guide.md** | Detailed Ubuntu server configuration, Docker setup, LM Studio integration |
| **Troubleshooting Guide.md** | Common issues with step-by-step solutions and diagnostics |
| **Custom System Prompts by Tech Stack.md** | How to customize prompts for different tech stacks (Python, Java, etc.) |
| **System Prompts Reference.md** | Reference guide for all agent prompt templates |
| **Tech Stack Configuration.md** | Tech stack configuration examples for various frameworks |

### Agent Workflows (workflows/)
| File | Agent Name | Function |
|------|------------|----------|
| **01-Planner-Agent.json** | Planner Agent | Decomposes natural language requests into structured tasks |
| **02-Code-Writer-Agent.json** | Code Writer Agent | Generates production-ready code with documentation |
| **03-Security-Reviewer-Agent.json** | Security Reviewer Agent | Reviews code for OWASP Top 10 vulnerabilities |
| **04-Quality-Reviewer-Agent.json** | Quality Reviewer Agent | Evaluates documentation coverage and test completeness |

---

## 🛠️ How to Use These Agents

### Step-by-Step Workflow

#### Step 1: Deploy the System (First Time Only)
```bash
# Clone repository
git clone https://github.com/eekanti/n8n-team.git
cd n8n-team

# Configure environment variables
cp .env.example .env
nano .env  # Edit DOMAIN_NAME, LOCAL_AI_MODEL, URLs

# Start services
docker-compose up -d
```

#### Step 2: Import Individual Agent Workflows
1. Open n8n web interface at http://localhost:5678
2. Click **"Create Workflow"** → **"Import from URL"**
3. Paste content from [workflows/01-Planner-Agent.json](./workflows/01-Planner-Agent.json)
4. Name it "Planner Agent"
5. Configure LLM node to use your "LM Studio Local LLM" credential

**Repeat for each agent workflow**:
- Import 02-Code-Writer-Agent.json → Name: "Code Writer Agent"
- Import 03-Security-Reviewer-Agent.json → Name: "Security Reviewer Agent"  
- Import 04-Quality-Reviewer-Agent.json → Name: "Quality Reviewer Agent"

#### Step 3: Test Each Agent Independently
**Planner Agent Test**:
- Execute workflow with Manual Trigger node input: `{"message": "Create a REST API for user management"}`
- Verify output contains structured task list in JSON format

**Code Writer Agent Test**:
- Input: Task description from Planner Agent output
- Verify code includes JSDoc comments, error handling, and security best practices

**Security Reviewer Test**:
- Input: Code content generated by Code Writer Agent
- Verify output identifies potential vulnerabilities with specific remediation steps

**Quality Reviewer Test**:
- Input: Code content from Code Writer Agent  
- Verify output provides quality score (1-10) and actionable improvement suggestions

#### Step 4: Connect Agents Together (Advanced - Optional)
Create a master workflow that chains all agents:
```
Manual Trigger → Planner Agent → Code Writer Agent → Security Reviewer → Quality Reviewer → Output
```

**Master workflow structure**: See [README.md#connect-agents-together-full-multi-agent-workflow](./README.md#-connect-agents-together-full-multi-agent-workflow)

---

## 🔧 Customization Guide

### Customize Tech Stack Configuration
Each agent's behavior is defined by system prompts. To customize for your stack:

1. Open workflow in n8n editor
2. Click the LLM node (e.g., "Code Writer Agent")
3. Edit **"System Message"** or **"Prompt Template"** field
4. Modify tech stack configuration section to match your requirements

**Example for Python/Django Stack**:
```markdown
Tech Stack Configuration:
- Languages: Python 3.10+, Type hints enabled
- Web Framework: Django with DRF (Django REST Framework)
- Database: PostgreSQL with Django ORM
- API Style: REST with OpenAPI/Swagger documentation
- Testing: pytest with coverage >= 90%

Additional Requirements:
- Payment integration using Stripe webhooks
- Background task processing with Celery + Redis
- Real-time notifications via WebSockets
```

**Complete customization guide**: See [docs/Custom System Prompts by Tech Stack.md](./docs/Custom%20System%20Prompts%20by%20Tech%20Stack.md)

### Adjust Model Parameters
To change LLM behavior (temperature, max tokens, etc.):

1. Open workflow in n8n editor
2. Click the LLM node you want to modify
3. In right sidebar, find **"Temperature"** parameter
4. Lower temperature (e.g., 0.3) for more deterministic output
5. Increase temperature (e.g., 0.7) for more creative responses

---

## 📊 Performance & Monitoring

### Resource Requirements (Minimum)
| Component | CPU | RAM | Disk Space |
|-----------|-----|-----|------------|
| n8n Container | 1 core | 2 GB | 10 GB |
| Redis Container | 0.5 core | 512 MB | 5 GB |
| LM Studio Server | 4 cores | 16 GB (for 7B model) | 10 GB |

### Useful Commands
```bash
# View n8n logs
docker-compose logs -f n8n

# Restart all services
docker-compose restart

# Check service health
curl http://localhost:5678/healthz

# Monitor resource usage (on Plexie server)
htop  # or top for basic monitoring

# Backup data manually
docker exec plexie-n8n tar czf /tmp/n8n-backup.tar.gz -C /home/node .n8n
```

**Performance tuning**: See [docs/System Architecture Overview.md#6-deployment-considerations](./docs/System%20Architecture%20Overview.md#6-deployment-considerations)

---

## 🐛 Troubleshooting Common Issues

### Issue: "Failed to connect to LM Studio"
**Quick Fix**: Verify server is running and accessible from Plexie server:
```bash
curl http://10.0.0.100:1234/v1/models
```

### Issue: "n8n container won't start"  
**Quick Fix**: Check logs for specific error:
```bash
docker-compose logs -f n8n | grep -i error
```

### Issue: "Community packages not loading"
**Quick Fix**: Verify environment variable is set and restart containers:
```bash
# In .env file, ensure this line exists:
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true

docker-compose restart n8n
```

**Complete troubleshooting guide**: See [docs/Troubleshooting Guide.md](./docs/Troubleshooting%20Guide.md)

---

## 📚 Additional Resources

### Documentation Index
- **[README.md]** - Complete project overview and setup instructions
- **[QUICKSTART.md]** - 5-minute quick start guide
- **[docs/Plexie Server Setup Guide.md]** - Detailed Ubuntu server configuration
- **[docs/Troubleshooting Guide.md]** - Common issues and solutions
- **[docs/System Architecture Overview.md]** - Complete system architecture diagrams

### External Links
- [n8n Documentation](https://docs.n8n.io/) - Official n8n platform documentation
- [Docker Compose Reference](https://docs.docker.com/compose/reference/) - Docker deployment guide
- [LM Studio Server API](https://lmstudio.ai/docs) - LM Studio server configuration

### Community Support
- **GitHub Issues**: Report bugs and feature requests at https://github.com/eekanti/n8n-team/issues
- **n8n Discord**: Real-time chat for n8n-specific questions at https://discord.gg/n8n

---

## 🎯 Next Steps After Setup

1. ✅ **Test each agent individually** using the test instructions above
2. 📝 **Customize prompts** to match your exact stack preferences (edit system messages in LLM nodes)
3. 🔗 **Connect agents together** in a master workflow for full multi-agent operation
4. 🎯 **Add MCP servers** for documentation research if desired

---

## 💡 Tips & Best Practices

### For Production Deployment
- ✅ Use HTTPS with SSL certificate (Certbot + Let's Encrypt recommended)
- ✅ Enable basic authentication for n8n web interface
- ✅ Set up automated daily backups of n8n data and Redis state
- ✅ Monitor resource usage during peak workflow execution times

### For Development & Testing
- ✅ Start with smaller models (7B parameters) for faster iteration
- ✅ Use lower temperature values (0.3-0.5) for more deterministic outputs
- ✅ Test each agent independently before connecting them together
- ✅ Keep detailed logs of prompt iterations to track improvements

---

**Ready to start?** Follow the [Quick Start guide](./QUICKSTART.md) to deploy in 5 minutes!

For complete documentation and setup instructions, see **[README.md]**(./README.md).

---

*This project is open source under the MIT license. Feel free to use, modify, and distribute as needed.*