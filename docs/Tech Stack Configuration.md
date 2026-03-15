# Tech Stack & Coding Standards Configuration

## Purpose
This document defines the technology preferences, coding standards, and project requirements that guide your AI agents when generating code.

---

## 📋 Your Preferences (Fill This In)

### Primary Languages
- **Language 1**: [e.g., TypeScript]
- **Language 2**: [e.g., Python]
- **Language 3**: [e.g., Go]

### Backend Frameworks
- **Framework 1**: [e.g., Express.js / NestJS]
- **Framework 2**: [e.g., FastAPI / Django]

### Frontend (if applicable)
- **Framework**: [e.g., React, Vue, or "N/A"]

### Databases
- **Primary DB**: [e.g., PostgreSQL]
- **Cache/Session**: [e.g., Redis]

### API Style
- **Type**: [REST / GraphQL / Both]

---

## 🔐 Security Standards

| Standard | Your Preference |
|----------|-----------------|
| OWASP Top 10 Compliance | ✅ Required |
| Input Validation | ✅ Always sanitize inputs |
| Authentication | JWT with rotation every 24h |
| Rate Limiting | ✅ Required on all endpoints |
| CORS Configuration | Strict, whitelist only allowed origins |
| Secrets Management | Environment variables only (never commit) |

---

## 🧹 Code Quality Standards

### Formatting Requirements
```markdown
- **TypeScript**: Use Prettier + ESLint with standard config
- **Python**: Follow PEP 8 style guide
- **Go**: Use `gofmt` and `go vet`
- **General**: Consistent indentation (2 spaces), trailing commas
```

### Documentation Requirements
```markdown
- **TypeScript**: JSDoc comments on all public functions/classes
- **Python**: Docstrings following NumPy/Google style
- **API Endpoints**: OpenAPI/Swagger documentation required
- **README Files**: Required for all new projects/modules
```

### Testing Requirements
```markdown
- **Minimum Coverage**: 80% (unit tests)
- **Test Frameworks**: 
  - TypeScript: Jest + Supertest
  - Python: pytest + coverage.py
- **E2E Tests**: Required for critical user flows
```

---

## 📈 Scalability Requirements

### Performance Targets
| Metric | Target |
|--------|--------|
| API Response Time (p95) | < 200ms |
| Concurrent Users Supported | Scale to at least 1,000 initially |
| Database Query Optimization | Use indexes on all foreign keys |
| Caching Strategy | Redis for frequently accessed data |

### Architecture Patterns
```markdown
- **Design Pattern**: Repository pattern for database access
- **Error Handling**: Centralized error middleware with logging
- **Logging Structure**: Structured JSON logs (Winston/Pino or Python logging)
- **Monitoring**: Add health check endpoints at /health and /ready
```

---

## 🎯 Project-Specific Rules

### Template Projects to Support
1. **[Project Type 1]**: [e.g., REST API for SaaS application]
   - Must include: User auth, payment integration, email notifications
   
2. **[Project Type 2]**: [e.g., Real-time dashboard with WebSocket]
   - Must include: Redis pub/sub, WebSocket connection pooling

3. **[Project Type 3]**: [e.g., Data processing pipeline]
   - Must include: Task queue (Bull/Redis), background jobs

### Forbidden Patterns ❌
```markdown
- No direct SQL queries without parameterization
- No synchronous file operations in API routes
- No hardcoded credentials or secrets
- No unprotected endpoints with sensitive data access
- No global state mutation outside of reducers/stores
```

---

## 🔄 Agent Behavior Rules

### How Agents Should Respond to Ambiguous Requests:
1. **Ask Clarifying Questions** before generating code if requirements are unclear
2. **Suggest Best Practices** even when not explicitly requested (e.g., "I'm adding rate limiting here for security")
3. **Provide Multiple Options** when trade-offs exist (e.g., "Option A is faster, Option B is more maintainable")

### When to Reject Requests:
- If the request would create a security vulnerability
- If the request violates stated coding standards
- If the technology stack doesn't match your configured preferences

---

## 📚 Example Usage in Agent Prompts

### For Code Writer Agent:
```markdown
You are a Senior Developer specializing in TypeScript and Node.js with Express.
Follow these project-specific rules:
1. Use repository pattern for database access
2. All API endpoints must have rate limiting middleware
3. Include JSDoc comments on all public functions
4. Write unit tests alongside implementation (Jest)
5. Never commit credentials - use environment variables only

Tech Stack: TypeScript, Express.js, PostgreSQL, Redis, JWT authentication
Security Standard: OWASP Top 10 compliant
```

### For Senior Reviewer Agent:
```markdown
You are a Principal Architect reviewing code for this project.

Checklist:
- [ ] Repository pattern implemented for database layer?
- [ ] Rate limiting on all public endpoints?
- [ ] Input validation using Zod/Joi schemas?
- [ ] JSDoc documentation complete?
- [ ] Unit tests written with adequate coverage?
- [ ] No hardcoded secrets or credentials?
- [ ] Health check endpoint included?

Reject if any critical items are missing.
```

---

## 📝 Customization Log

| Date | Change Made | Reason |
|------|-------------|--------|
| 2024-03-15 | Initial template created | Foundation for multi-agent system |
| [Date] | Add Project Type 1 rules | Support SaaS application projects |
| [Date] | Update security standards | Increased requirements for compliance |

---

## 🎯 Quick Reference: How to Use This Document

### For Customizing Agent Prompts:
1. Open the relevant agent workflow in n8n editor
2. Find the "System Message" or "Prompt Template" field
3. Copy relevant sections from this document into the prompt
4. Test with a sample task and adjust as needed

### For Adding New Projects:
1. Add project type to the "Template Projects to Support" section
2. Define specific rules for that project type in subsections
3. Reference these rules in agent prompts via variables

---

*This document is living - update it as your requirements evolve!*