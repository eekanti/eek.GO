# Setup Guide - Multi-Agent Coding System

## 1. n8n Installation & Configuration

### Option A: Self-Hosted (Recommended for full control)
```bash
docker run -d --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true \
  n8nio/n8n
```

### Option B: Cloud
Sign up at https://n8n.io/cloud/

### Enable Tool Usage (CRITICAL!)
For self-hosted, ensure this environment variable is set:
```bash
export N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

## 2. Install Required Nodes

In n8n, go to **Settings → Community Packages** and install:
- `@n8n/n8n-nodes-langchain` (for AI/LLM nodes)
- Any MCP server integrations you plan to use

Verify installation by checking for these node types in your editor:
- OpenAI Chat Model
- Anthropic Chat Model  
- Basic LLM Chain
- Question and Answer Chain

## 3. Configure Credentials

Create the following credentials in n8n (**Settings → Credentials**):

| Credential Name | Purpose | How to Get |
|-----------------|---------|------------|
| OpenAI API Key | For all AI agents and code generation | https://platform.openai.com/api-keys |
| GitHub Personal Access Token | Repository operations (push, PRs) | Settings → Developer settings → Personal access tokens |
| Context7 API Key (optional) | Documentation lookup via MCP | context7.ai |
| Reddit API Credentials (optional) | Community research via MCP | https://www.reddit.com/prefs/apps |

### GitHub Token Permissions Needed:
```
repo (full control of private repositories)
user (read user profile data)
```

## 4. Set Up Obsidian Vault

Create your vault at a location accessible to n8n:

```bash
# Create directory structure
mkdir -p ~/obsidian-vault/{Error Logs,Knowledge Base}
cd ~/obsidian-vault

# Initialize knowledge base files
cat > "Project Memory & Learning Log.md" << 'EOF'
# Project Memory & Learning Log

## Purpose
This vault serves as the collective "brain" for our AI coding agents to learn from mistakes.

---

## 📝 Error Log Template

```markdown
## Error: {{title}}
- **Date**: {{date}}
- **Agent**: {{agent_name}}
- **File**: {{file_path}}
- **Error Type**: {{error_type}}
- **Description**: {{description}}
- **Root Cause**: {{root_cause}}
- **Solution Applied**: {{solution}}
- **Prevention Strategy**: {{prevention}}

### Code Snippet
```{{language}}
{{code_snippet}}
```

---
```

## 📊 Decision Log Template

```markdown
## Decision: {{decision_title}}
- **Date**: {{date}}
- **Made By**: {{agent_name}}
- **Context**: {{context}}
- **Options Considered**: {{options}}
- **Final Choice**: {{choice}}
- **Rationale**: {{rationale}}

---
```

### Make Vault Accessible to n8n:
```bash
# If self-hosting, mount the vault in Docker:
docker run -d --name n8n \
  ...
  -v ~/obsidian-vault:/vault \
  ...
```

## 5. Configure MCP Servers

MCP (Model Context Protocol) servers provide tools to AI agents for research and tool access.

### Context7 Setup (Documentation Lookup)
```bash
# Clone the MCP server repository
git clone https://github.com/sourcegraph/context7-mcp-server.git
cd context7-mcp-server

# Install dependencies
npm install

# Configure with your API key
export CONTEXT7_API_KEY=your_key_here
node index.js --port 3001
```

### Reddit MCP Setup (Community Insights)
```bash
git clone https://github.com/modelcontextprotocol/servers.git
cd servers/src/reddit

# Set up Reddit credentials in n8n first, then:
npm install
npm start
```

### Available MCP Tools for Agents:
- `context7`: API documentation lookup (Context7)
- `fetch`: Web research and content extraction
- `reddit`: Community insights and troubleshooting
- `github`: Repository operations (alternative to n8n GitHub node)

## 6. Import Agent Workflows

1. Open your n8n instance in browser (http://localhost:5678 or cloud URL)
2. Click **"Import from File"** button
3. Select each workflow JSON file from this repository's `n8n-workflows/` folder
4. Configure credentials for each node when prompted

### Import Order (Important!):
1. **Error Logger** - Base learning system should exist first
2. **Code Writer** - With MCP tools configured
3. **Senior Reviewer** - Quality and security checks
4. **Planner** - Orchestrator agent last

## 7. Test Individual Agents

### Test Planner Agent:
1. Open the workflow in n8n editor
2. Click **"Execute Workflow"** button
3. Provide a natural language prompt like:
   > "Create a simple REST API with user authentication and JWT tokens"
4. Review the task breakdown output - should be structured JSON

### Test Code Writer Agent:
1. Provide the task from Planner output
2. Watch MCP servers being called for documentation research
3. Check generated code in the output - should include security considerations

### Test Senior Reviewer:
1. Input generated code from previous step
2. Review feedback on:
   - Security vulnerabilities (OWASP Top 10)
   - Best practices adherence
   - Scalability considerations
3. Should return quality score and recommendations

### Test Error Logger:
1. Intentionally trigger an error in any agent workflow
2. Verify it's captured in Obsidian vault
3. Check if prevention strategies are documented for future use

## 8. Connect Agents (Optional)

For automated end-to-end execution, create a supervisor workflow:

### Method A: Execute Workflow Node (Simplest)
1. Create new workflow called "Supervisor"
2. Add **Execute Workflow** node
3. Configure to call each agent workflow in sequence
4. Pass data between agents using shared task objects

### Method B: Webhook Chain (Distributed Setup)
1. Each agent has a webhook trigger endpoint
2. Planner triggers Code Writer via webhook
3. Code Writer triggers Senior Reviewer via webhook
4. All errors routed to Error Logger webhook

## 9. Configure Environment Variables

For self-hosted n8n, add these to your Docker run command:

```bash
-N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true \
-e OPENAI_API_KEY=sk-your_key_here \
-e GITHUB_TOKEN=ghp-your_token_here \
-e OBSIDIAN_VAULT_PATH=/vault \
-e CONTEXT7_ENABLED=true
```

For n8n cloud, set these in **Settings → Environment Variables**.

## Troubleshooting Guide

### Agents not generating code:
- ✅ Check OpenAI API key is valid
- ✅ Verify model quota hasn't been exceeded  
- ✅ Review system prompts in each agent configuration
- ✅ Try different model (gpt-4o vs claude)

### MCP servers not responding:
- ✅ Ensure MCP server processes are running (`ps aux | grep mcp`)
- ✅ Check network connectivity between n8n and MCP endpoints
- ✅ Verify API keys for external services (Context7, Reddit)
- ✅ Review firewall rules blocking ports 3001, etc.

### Error logs not updating Obsidian:
- ✅ Verify vault path is accessible to n8n process
- ✅ Check file permissions on Obsidian directory (`ls -la ~/obsidian-vault`)
- ✅ Test manual file write with a simple workflow first
- ✅ Ensure webhook URLs in workflows point to correct endpoints

### Memory errors / OOM:
- ✅ Increase Docker memory limits for n8n container
- ✅ Reduce batch sizes in agent processing
- ✅ Implement pagination for large task lists

## Next Steps & Customization

1. **Customize system prompts** for your specific use cases (see System Prompts Reference)
2. **Add additional MCP servers** as needed (Docker docs, AWS documentation, etc.)
3. **Implement caching** to reduce API costs and improve speed
4. **Set up automated backup** of Obsidian vault (git push daily?)
5. **Consider adding human review gate** before production commits
6. **Add code scanning tools** for security vulnerabilities (SAST/DAST)

## Monitoring & Maintenance

### Daily Checks:
- [ ] Verify all MCP servers are running
- [ ] Check API quota usage (OpenAI, Context7)
- [ ] Review recent error logs in Obsidian
- [ ] Monitor GitHub repository health

### Weekly Tasks:
- [ ] Backup Obsidian vault to cloud storage
- [ ] Analyze error patterns for system improvements
- [ ] Update MCP server configurations as needed
- [ ] Review and prune old task executions

## Support & Resources

- n8n Documentation: https://docs.n8n.io/
- OpenAI API Docs: https://platform.openai.com/docs/
- Context7 Docs: https://context7.ai/docs
- MCP Protocol: https://modelcontextprotocol.io/
- Obsidian Help: https://help.obsidian.md/

---

*This guide is continuously updated. Report issues or suggestions in the repository.*