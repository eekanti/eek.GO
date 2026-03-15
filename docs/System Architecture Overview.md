# 🏗️ System Architecture Overview

This document explains the complete architecture of the multi-agent coding system, including how each component works and how they interact.

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Plexie Server (Ubuntu)                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Docker Compose                          │ │
│  │  ┌─────────────────┐    ┌────────────────────────────────┐ │ │
│  │  │   n8n (Port 5678)│◄──►│     Redis Cache (Persistence) │ │ │
│  │  │                 │    │                                │ │ │
│  │  │  - Workflow Engine│    │  - Session State              │ │ │
│  │  │  - Agent Orchestration│  │  - Execution Queue          │ │ │
│  │  └────────┬────────┘    └────────────────────────────────┘ │ │
│  │           │                                                 │ │
│  │           ▼                                                 │ │
│  │  ┌─────────────────────────────────────────────────────────┐│ │
│  │  │              Agent System (LLM Nodes)                   ││ │
│  │  │                                                         ││ │
│  │  │  ┌──────────┐    ┌─────────────┐   ┌─────────────────┐ ││ │
│  │  │  │ Planner  │───►│ Code Writer │──►│ Security Reviewer│ ││ │
│  │  │  │ Agent     │    │             │   │                 │ ││ │
│  │  │  └──────────┘    └─────────────┘   └─────────────────┘ ││ │
│  │  │                                         │               ││ │
│  │  │                                         ▼               ││ │
│  │  │                              ┌───────────────────┐       ││ │
│  │  │                              │ Quality Reviewer   │       ││ │
│  │  │                              │ Agent              │       ││ │
│  │  │                              └───────────────────┘       ││ │
│  │  └─────────────────────────────────────────────────────────┘│ │
│  │                                                             │ │
│  │  ┌─────────────────────────────────────────────────────────┐│ │
│  │  │              External Services                          ││ │
│  │  │                                                         ││ │
│  │  │    ┌──────────────────────────────┐                    ││ │
│  │  │    │    LM Studio (Local LLM)     │◄───────────────────┘│ │
│  │  │    │    IP: 10.0.0.100:1234      │   Port 1234         │ │
│  │  │    │    Model: mistral-7b...     │                    ││ │
│  │  │    └──────────────────────────────┘                    ││ │
│  │  └─────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

User Interaction Flow:
1. User opens n8n web interface (http://localhost:5678)
2. User executes workflow via Manual Trigger node
3. Workflow processes through agent chain
4. Results returned to user in output nodes
```

## Component Breakdown

### 1. Docker Infrastructure

#### n8n Container
- **Port**: 5678 (web interface)
- **Role**: Workflow orchestration engine
- **Features**:
  - Visual workflow designer
  - Node-based execution engine
  - Credential management system
  - Community packages support
- **Persistence**: Data stored in `/docker/appdata/n8n/data`

#### Redis Container
- **Port**: 6379 (internal)
- **Role**: Session state and caching layer
- **Features**:
  - Fast data access for workflow execution
  - Queue management for parallel processing
  - Temporary storage during multi-step workflows
- **Persistence**: Data stored in `/docker/appdata/redis/data`

### 2. Agent System Architecture

#### Planner Agent (01-Planner-Agent.json)
**Purpose**: Transform natural language requests into structured, executable tasks.

**Input Format**:
```json
{
  "message": "Create a user authentication API with login and registration endpoints"
}
```

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
- Task decomposition using Chain-of-Thought prompting
- Dependency tracking between tasks
- Complexity estimation (low/medium/high)
- JSON output for programmatic consumption

#### Code Writer Agent (02-Code-Writer-Agent.json)
**Purpose**: Generate production-ready code following defined tech stack and security standards.

**Tech Stack Configuration**:
- **Languages**: TypeScript (strict mode), JavaScript, JSX
- **Backend Framework**: Node.js with Express.js or Fastify
- **Frontend Framework**: React with hooks (functional components)
- **API Style**: REST APIs with JSON payloads
- **Database**: PostgreSQL (Prisma ORM) or MongoDB (Mongoose)

**Security Requirements**:
- Input validation before processing
- JWT authentication (24-hour expiry)
- Password hashing with bcrypt (salt rounds >= 10)
- Rate limiting on public endpoints
- CORS configured for known origins only
- No sensitive data in logs/errors

**Output Format**:
```markdown
File: src/api/users.ts

```typescript
import express from 'express';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8)
});

export const loginUser = async (req, res) => {
  // ... complete implementation with JSDoc comments
};
```

**Design Decisions**:
- Used Zod for runtime validation
- Implemented rate limiting middleware
- JWT tokens expire after 24 hours

**Testing Instructions**:
Run `npm test -- src/api/users.test.ts` to execute unit tests.

#### Security Reviewer Agent (03-Security-Reviewer-Agent.json)
**Purpose**: Identify security vulnerabilities following OWASP Top 10 guidelines.

**Review Checklist**:
- ✅ Input validation with schema validation
- ✅ Parameterized queries (no raw SQL injection risks)
- ✅ Secrets in environment variables, not hardcoded
- ✅ Password hashing with bcrypt/Argon2
- ✅ Rate limiting on auth endpoints
- ✅ CORS restricts to known domains only
- ✅ No PII or credentials in logs/responses
- ✅ Dependencies checked for vulnerabilities (npm audit)
- ✅ Error messages don't leak stack traces

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
  "recommendations": [
    "Add rate limiting to prevent brute force attacks"
  ]
}
```

#### Quality Reviewer Agent (04-Quality-Reviewer-Agent.json)
**Purpose**: Evaluate code quality, documentation coverage, and maintainability.

**Review Checklist**:
- ✅ All public functions/classes have JSDoc/Docstring comments
- ✅ Unit tests cover critical paths (minimum 80% line coverage)
- ✅ Error handling with custom error types
- ✅ Database queries optimized (no N+1 problems)
- ✅ Configuration externalized via environment variables
- ✅ Structured logging with appropriate log levels
- ✅ REST API conventions followed properly
- ✅ React components use hooks correctly

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
  "recommendations": [
    "Consider adding TypeScript strict mode configuration",
    "Implement centralized error handling middleware"
  ]
}
```

### 3. External Services Integration

#### LM Studio Local LLM Server
- **Location**: IP address `10.0.0.100`, Port `1234`
- **Protocol**: OpenAI-compatible API at `/v1/` endpoint
- **Authentication**: None required (local server)
- **Supported Models**: mistral-7b-instruct-v0.2, llama-3.1-8b-instruct, codellama-13b-instruct

**API Endpoint Examples**:
```bash
# List available models
curl http://10.0.0.100:1234/v1/models

# Generate text (example)
curl -X POST http://10.0.0.100:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-7b-instruct-v0.2",
    "messages": [{"role": "user", "content": "Explain quantum computing"}]
  }'
```

**Configuration in n8n**:
- **Credential Type**: OpenAI API (LM Studio uses compatible endpoint)
- **Base URL**: `http://10.0.0.100:1234/v1`
- **API Key**: Any value (e.g., "local-key")

### 4. Data Flow & Execution Model

#### Sequential Processing Flow
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

#### Parallel Processing Flow (Advanced)
When all agents have independent inputs, they can run in parallel:
```
User Request → Planner Agent → Task List Generation
    ↓
    ├─→ Code Writer Agent A ─┐
    ├─→ Security Reviewer A  │
    ├─→ Quality Reviewer A   ├──→ Aggregate Results A
    ├─→ Code Writer Agent B ─┘
    ├─→ Security Reviewer B  │
    └─→ Quality Reviewer B   ├──→ Aggregate Results B
```

#### Error Handling Flow
```
Workflow Execution → Node Failure → Error Output Capture
    ↓
Error Logger Agent (if configured) → Log to Obsidian or other destination
    ↓
Retry Logic (configurable per node) → Re-execute with fallback parameters
```

### 5. Configuration Management

#### Environment Variables (.env)
| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `DOMAIN_NAME` | Server domain/IP for URLs | localhost | Yes |
| `N8N_EDITOR_BASE_URL` | Base URL for n8n editor | https://plexie.yourdomain.com | Yes |
| `WEBHOOK_URL` | Webhook base URL for external triggers | https://plexie.yourdomain.com | Yes |
| `LOCAL_AI_BASE_URL` | LM Studio server endpoint | http://10.0.0.100:1234/v1 | Yes |
| `LOCAL_AI_MODEL` | Model name loaded in LM Studio | mistral-7b-instruct-v0.2 | Yes |

#### Agent Prompt Configuration
Each agent's system prompt can be customized by editing the LLM node parameters in n8n:

**Location**: Open workflow → Click LLM node → Edit "System Message" or "Prompt Template" field

**Example Customization for Python Backend**:
```markdown
Tech Stack Configuration:
- Languages: Python 3.10+, Type hints enabled
- Web Framework: FastAPI with Pydantic models
- Database: SQLAlchemy ORM with PostgreSQL
- API Style: REST with OpenAPI documentation
- Testing: pytest with coverage >= 90%

Additional Requirements:
- Payment integration using Stripe webhooks
- Background task processing with Celery + Redis
- Real-time notifications via WebSockets
```

### 6. Deployment Considerations

#### Resource Requirements (Minimum)
| Component | CPU | RAM | Disk Space |
|-----------|-----|-----|------------|
| n8n Container | 1 core | 2 GB | 10 GB |
| Redis Container | 0.5 core | 512 MB | 5 GB |
| LM Studio Server | 4 cores | 16 GB (for 7B model) | 10 GB |

#### Scalability Options
- **Horizontal Scaling**: Run multiple n8n instances behind load balancer (requires Redis for shared state)
- **Vertical Scaling**: Increase RAM/CPU allocation in docker-compose.yml deploy section
- **Model Scaling**: Use larger LLM models if more reasoning capability needed (e.g., codellama-13b instead of mistral-7b)

#### Backup Strategy
```bash
# Daily automated backup script location: /root/backup-n8n.sh
# Cron schedule: 0 2 * * * (daily at 2 AM)

# Manual backup command:
docker exec plexie-n8n tar czf /tmp/n8n-backup.tar.gz -C /home/node .n8n
docker cp plexie-redis:/data /tmp/redis-data/
tar -czf n8n-full-backup.tar.gz /tmp/n8n-backup.tar.gz /tmp/redis-data
```

## Summary

This multi-agent system provides a complete solution for automated code generation with built-in quality and security review. Each agent specializes in its domain:

- **Planner**: Breaks down complex requests into manageable tasks
- **Code Writer**: Generates production-ready, documented code
- **Security Reviewer**: Ensures OWASP compliance
- **Quality Reviewer**: Validates documentation and test coverage

The system runs entirely locally on your Plexie server using LM Studio for the LLM, ensuring data privacy and no external API costs. All workflows are visual in n8n, making it easy to modify and extend as your needs evolve.

For detailed setup instructions, see [README.md](https://github.com/eekanti/n8n-team/blob/main/README.md) or [docs/Plexie Server Setup Guide.md](https://github.com/eekanti/n8n-team/blob/main/docs/Plexie%20Server%20Setup%20Guide.md).
