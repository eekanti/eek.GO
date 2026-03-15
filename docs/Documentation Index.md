# 📚 Documentation Index - AI Coding Agents on Plexie Server

Welcome to the complete documentation for the Multi-Agent System on Plexie Server. This index provides quick navigation to all available resources organized by purpose and audience.

## 🎯 Quick Navigation

### For New Users (Start Here!)
1. **[QUICKSTART.md](../QUICKSTART.md)** - 5-minute deployment guide
2. **[README.md](./README.md)** - Complete project overview and features

### For Server Administrators
3. **[docs/Plexie Server Setup Guide.md](./Plexie%20Server%20Setup%20Guide.md)** - Detailed server configuration instructions
4. **[docs/Troubleshooting Guide.md](./Troubleshooting%20Guide.md)** - Common issues and solutions

### For Developers & Customizers
5. **[docs/System Architecture Overview.md](./System%20Architecture%20Overview.md)** - Complete system architecture diagrams
6. **[docs/Custom System Prompts by Tech Stack.md](./Custom%20System%20Prompts%20by%20Tech%20Stack.md)** - How to customize agent prompts for your stack

### For Operations & Maintenance
7. **[docs/System Architecture Overview.md](./System%20Architecture%20Overview.md#6-deployment-considerations)** - Performance tuning and backup strategies
8. **[docs/Troubleshooting Guide.md](./Troubleshooting%20Guide.md)** - Operational issues and fixes

---

## 📖 Complete Documentation List

### Core Documentation

| Document | Purpose | Recommended For |
|----------|---------|-----------------|
| **[README.md](../README.md)** | Project overview, features, complete setup instructions | Everyone starting the project |
| **[QUICKSTART.md](../QUICKSTART.md)** | 5-minute quick deployment guide | Users in a hurry |
| **[docs/Plexie Server Setup Guide.md](./Plexie%20Server%20Setup%20Guide.md)** | Detailed Ubuntu server configuration, Docker setup, LM Studio integration | System administrators deploying to Plexie |
| **[docs/Troubleshooting Guide.md](./Troubleshooting%20Guide.md)** | Common issues with step-by-step solutions | Anyone encountering problems |

### Architecture & Technical Documentation

| Document | Purpose | Recommended For |
|----------|---------|-----------------|
| **[docs/System Architecture Overview.md](./System%20Architecture%20Overview.md)** | Complete system architecture, component breakdowns, data flow diagrams | Developers understanding the full system |
| **[docs/Custom System Prompts by Tech Stack.md](./Custom%20System%20Prompts%20by%20Tech%20Stack.md)** | Customizing prompts for different tech stacks (Python, Java, etc.) | Teams customizing agents for their stack |

### Prompt Configuration References

| Document | Purpose | Recommended For |
|----------|---------|-----------------|
| **[docs/System Prompts Reference.md](./System%20Prompts%20Reference.md)** | Reference guide for all agent prompt templates | Developers modifying prompts |
| **[docs/Tech Stack Configuration.md](./Tech%20Stack%20Configuration.md)** | Tech stack configuration examples (React, Django, etc.) | Teams configuring specific stacks |

---

## 🗂️ Repository Structure

```
n8n-team/
├── README.md                    # Main project documentation with overview and setup
├── QUICKSTART.md                # 5-minute quick start guide
├── docker-compose.yml           # Docker Compose configuration for deployment
├── .env.example                 # Environment variable template
│
├── docs/                       # Detailed documentation folder
│   ├── System Architecture Overview.md    # Complete system architecture
│   ├── Plexie Server Setup Guide.md       # Ubuntu server deployment guide
│   ├── Troubleshooting Guide.md           # Common issues and solutions
│   ├── Custom System Prompts by Tech Stack.md  # Prompt customization guide
│   ├── System Prompts Reference.md        # All agent prompt templates reference
│   └── Tech Stack Configuration.md        # Tech stack configuration examples
│
├── workflows/                  # Pre-configured n8n workflow files
│   ├── 01-Planner-Agent.json              # Planner Agent workflow (task decomposition)
│   ├── 02-Code-Writer-Agent.json          # Code Writer Agent workflow (code generation)
│   ├── 03-Security-Reviewer-Agent.json    # Security Reviewer Agent workflow (OWASP checks)
│   ├── 04-Quality-Reviewer-Agent.json     # Quality Reviewer Agent workflow (quality assessment)
│   └── 05-Error-Logger-Agent.json         # Error Logger Agent workflow (error handling)
│
├── AI_CODING_AGENTS_OVERVIEW.md        # High-level system overview and features
└── .gitignore                  # Git ignore rules for project files
```

---

## 🎓 Learning Path by User Type

### New Users - Deployment Focus
1. Start with **[QUICKSTART.md](../QUICKSTART.md)** to deploy in 5 minutes
2. Review **[README.md](./README.md#quick-deployment-steps)** for detailed setup steps
3. Follow **[docs/Plexie Server Setup Guide.md](./Plexie%20Server%20Setup%20Guide.md)** if deploying on Ubuntu server

### Developers - Customization Focus
1. Read **[README.md](./README.md#-features-and-capabilities)** to understand features
2. Study **[docs/System Architecture Overview.md](./System%20Architecture%20Overview.md)** for system design
3. Follow **[docs/Custom System Prompts by Tech Stack.md](./Custom%20System%20Prompts%20by%20Tech%20Stack.md)** to customize prompts

### Operations - Maintenance Focus
1. Review **[README.md](./README.md#-backup-strategy-and-data-persistence)** for backup procedures
2. Check **[docs/Troubleshooting Guide.md](./Troubleshooting%20Guide.md#general-debugging-commands)** for operational commands
3. Read **[docs/System Architecture Overview.md#6-deployment-considerations](./System%20Architecture%20Overview.md)** for performance tuning

### Troubleshooting - Problem Resolution Focus
1. Identify your issue category (LM Studio, n8n container, workflow validation, etc.)
2. Jump directly to relevant section in **[docs/Troubleshooting Guide.md](./Troubleshooting%20Guide.md#lm-studio-connection-issues)**
3. Follow step-by-step diagnosis and solution procedures

---

## 🔄 Workflow Files Reference

Each workflow file implements one specialized agent. All are pre-configured for use with LM Studio local LLM.

| File | Agent Name | Function | Key Features |
|------|------------|----------|--------------|
| **[workflows/01-Planner-Agent.json](./workflows/01-Planner-Agent.json)** | Planner Agent | Decomposes natural language requests into structured tasks | Task decomposition, dependency tracking, complexity estimation |
| **[workflows/02-Code-Writer-Agent.json](./workflows/02-Code-Writer-Agent.json)** | Code Writer Agent | Generates production-ready code with documentation | Tech stack awareness, security best practices, JSDoc comments |
| **[workflows/03-Security-Reviewer-Agent.json](./workflows/03-Security-Reviewer-Agent.json)** | Security Reviewer Agent | Reviews code for OWASP Top 10 vulnerabilities | Input validation checks, JWT implementation review, rate limiting verification |
| **[workflows/04-Quality-Reviewer-Agent.json](./workflows/04-Quality-Reviewer-Agent.json)** | Quality Reviewer Agent | Evaluates documentation coverage and test completeness | JSDoc analysis, test coverage assessment, architectural feedback |
| **[workflows/05-Error-Logger-Agent.json](./workflows/05-Error-Logger-Agent.json)** | Error Logger Agent | Logs errors to Obsidian or other destinations for debugging | Structured logging, error categorization, integration flexibility |

**To use a workflow**: Import via n8n web interface → Click "Create Workflow" → "Import from URL" → Paste file content.

---

## 🔗 External Resources

### Official Documentation
- [n8n Documentation](https://docs.n8n.io/) - Complete n8n platform documentation
- [Docker Compose Reference](https://docs.docker.com/compose/reference/) - Docker deployment guide
- [LM Studio Server API](https://lmstudio.ai/docs) - LM Studio server configuration

### Community Resources
- [n8n Community Forum](https://community.n8n.io/) - Ask questions, share workflows
- [Discord n8n Channel](https://discord.gg/n8n) - Real-time chat with community

---

## 📝 Contributing to Documentation

If you find errors or have suggestions for improvement:

1. **For typo fixes**: Edit the file directly and submit a PR
2. **For content improvements**: Create an issue describing your suggestion
3. **For new documentation topics**: Open a feature request with proposed structure

---

## 🆘 Getting Help

### Before Asking for Help
- ✅ Review **[docs/Troubleshooting Guide.md](./Troubleshooting%20Guide.md)** - Your issue might already be documented
- ✅ Check the relevant section in this index above
- ✅ Verify you've followed setup instructions correctly

### When You Need Assistance
1. **For deployment issues**: See [Plexie Server Setup Guide](./Plexie%20Server%20Setup%20Guide.md) troubleshooting section
2. **For agent customization questions**: Review [Custom System Prompts by Tech Stack guide](./Custom%20System%20Prompts%20by%20Tech%20Stack.md)
3. **For system architecture questions**: Read [System Architecture Overview](./System%20Architecture%20Overview.md)

### Community Support Channels
- **GitHub Issues**: Report bugs and feature requests at https://github.com/eekanti/n8n-team/issues
- **n8n Discord**: Real-time chat for n8n-specific questions at https://discord.gg/n8n

---

## 📚 Documentation Version History

| Date | Document | Changes |
|------|----------|---------|
| 2026-03-15 | System Architecture Overview.md | Created complete architecture documentation with diagrams |
| 2026-03-15 | Plexie Server Setup Guide.md | Detailed Ubuntu server deployment instructions |
| 2026-03-15 | QUICKSTART.md | 5-minute quick start guide for rapid deployment |
| 2026-03-15 | Troubleshooting Guide.md | Comprehensive troubleshooting procedures |

---

## 🎯 Quick Links Summary

- **Start Here**: [README.md](../README.md)
- **Quick Deploy**: [QUICKSTART.md](../QUICKSTART.md)
- **Server Setup**: [Plexie Server Setup Guide](./docs/Plexie%20Server%20Setup%20Guide.md)
- **Troubleshooting**: [Troubleshooting Guide](./docs/Troubleshooting%20Guide.md)
- **Architecture**: [System Architecture Overview](./docs/System%20Architecture%20Overview.md)
- **Customization**: [Custom Prompts by Tech Stack](./docs/Custom%20System%20Prompts%20by%20Tech%20Stack.md)

---

## 🔄 Repository Information

**Project Repository**: https://github.com/eekanti/n8n-team  
**Documentation Version**: 1.0.0  
**Last Updated**: March 15, 2026  

---

**Happy coding with your AI agents!** 🚀 If you have questions, refer to the relevant guide above or join our community discussions.