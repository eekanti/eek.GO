# AI Multi-Agent Coding System

A sophisticated multi-agent system built on n8n that uses natural language to generate production-ready code.

## 🎯 Overview

This project implements a 4-agent architecture where each agent has specialized responsibilities:
- **Planner Agent**: Translates your ideas into actionable tasks
- **Code Writer Agent**: Writes code using MCP servers for research (Context7, fetch, reddit)
- **Senior Review Agent**: Reviews code quality, security, and scalability
- **Error Logger Agent**: Captures mistakes and updates the learning system

## 📁 Project Structure

```
ai-coding-agents/
├── n8n-workflows/           # Agent workflows (JSON export)
├── docs/                    # Documentation
├── obsidian-vault/          # Knowledge base for learning
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- n8n instance (self-hosted or cloud)
- OpenAI API key (or compatible LLM provider)
- Context7 MCP server configured
- Obsidian vault for knowledge base
- GitHub repository access

### Installation Steps
1. **Import Workflows**: Import each agent workflow into your n8n instance
2. **Configure Credentials**: Set up API keys for OpenAI, GitHub, etc.
3. **Set Up MCP Servers**: Configure Context7 and other research tools
4. **Initialize Obsidian Vault**: Copy files to your vault
5. **Test Each Agent**: Run individual agents before connecting them

## 🔧 Configuration

### Environment Variables
```bash
# Required
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
OPENAI_API_KEY=your_key_here
GITHUB_TOKEN=your_token_here
OBSIDIAN_VAULT_PATH=/path/to/vault

# Optional
CONTEXT7_ENABLED=true
REDDIT_API_KEY=your_key_here
```

## 📊 Workflow Diagram

```
[User Input] 
    │
    ▼
┌─────────────┐     ┌─────────────┐
│ Planner     │────▶│ Task        │
│ Agent       │     │ Breakdown   │
└─────────────┘     └─────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    ▼                     ▼                     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Code Writer │◀───▶│ Senior      │◀───▶│ Error       │
│ (with MCP)  │     │ Reviewer    │     │ Logger      │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    [GitHub Commit]
```

## 🛠️ Tool Stack

| Component | Purpose |
|-----------|----------|
| n8n | Workflow orchestration |
| OpenAI/Anthropic | AI reasoning and code generation |
| Context7 MCP | API documentation lookup |
| Reddit MCP | Community insights |
| Fetch MCP | Web research |
| GitHub API | Repository management |
| Obsidian | Knowledge base |

## 📚 Learning from Mistakes

The Error Logger Agent continuously improves the system by:
1. Capturing all execution errors
2. Analyzing root causes
3. Updating prevention strategies in Obsidian
4. Making this knowledge available to future runs

## 🔐 Security Notes

- All API keys are stored as n8n credentials (never commit)
- GitHub repository is private by default
- Error logs may contain sensitive data - review before sharing
- Consider adding code scanning tools for security vulnerabilities

## 🤝 Contributing

This system evolves as you use it. Add your own patterns to the knowledge base!

## 📄 License

MIT - Feel free to adapt and improve!