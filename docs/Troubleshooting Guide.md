# 🔧 Troubleshooting Guide

This guide provides solutions to common issues encountered when running the AI Coding Agents system on Plexie server.

## LM Studio Connection Issues

### Issue: "Failed to connect to http://10.0.0.100:1234/v1"

**Symptoms**:
- LLM node errors with connection refused message
- Workflow execution fails at first LLM call
- Error logs show "ECONNREFUSED" or similar network error

**Diagnosis Steps**:
```bash
# 1. Check if LM Studio server is running (on the machine where LM Studio is installed)
# Look for "Server Started on port 1234" message in LM Studio UI

# 2. Test connectivity from Plexie server
curl -v http://10.0.0.100:1234/v1/models

# Expected output (if working):
# {
#   "data": [
#     {
#       "id": "mistral-7b-instruct-v0.2",
#       "object": "model"
#     }
#   ]
# }

# 3. Check firewall settings on LM Studio machine
sudo ufw status | grep 1234
```

**Solutions**:

#### Solution A: Start LM Studio Server
1. Open LM Studio application
2. Click **"Server"** tab (left sidebar)
3. Select your loaded model from dropdown
4. Click **"Start Server"** button
5. Verify "Server started on port 1234" message appears

#### Solution B: Fix Firewall Rules
```bash
# On LM Studio machine (not Plexie):
sudo ufw allow 1234/tcp
sudo ufw reload

# Or if using Windows firewall, ensure port 1234 is allowed for inbound connections
```

#### Solution C: Verify IP Address
```bash
# On LM Studio machine, find its IP address:
hostname -I  # Linux/Mac
ipconfig     # Windows (look for IPv4 Address)

# Update .env file on Plexie if needed:
nano /root/ai-coding-agents/.env
LOCAL_AI_BASE_URL=http://CORRECT_IP:1234/v1
```

#### Solution D: Test with Different Port
If port 1234 is blocked, change LM Studio to use a different port:
1. In LM Studio Server tab, enter custom port number (e.g., 8080)
2. Update .env file on Plexie:
   ```bash
   LOCAL_AI_BASE_URL=http://10.0.0.100:8080/v1
   ```

---

## n8n Container Issues

### Issue: "Container keeps restarting" or "Won't start"

**Symptoms**:
- `docker ps` shows n8n in "Restarting" state repeatedly
- Logs show errors like "database connection failed" or "out of memory"

**Diagnosis Steps**:
```bash
# Check detailed logs
docker-compose logs -f n8n | tail -50

# Check disk space on server
df -h /

# Check available RAM
free -m
```

**Solutions**:

#### Solution A: Insufficient Disk Space
If `/` partition is nearly full:
```bash
# Clean up Docker cache (on Plexie server):
docker system prune -a --volumes

# Or increase disk capacity in VM settings if running in virtual machine
```

#### Solution B: Out of Memory Error
If n8n fails with "OOMKilled" errors:
```yaml
# Edit docker-compose.yml and add memory limits for n8n service:
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

#### Solution C: Redis Connection Issues
If error mentions "Redis connection failed":
```bash
# Check if Redis container is running
docker ps | grep redis

# If not, start it manually
docker-compose up -d redis

# Verify Redis is responding
docker exec plexie-redis redis-cli ping  # Should return PONG
```

#### Solution D: Database Corruption
If errors mention database corruption:
```bash
# Backup current data first
cp -r /docker/appdata/n8n/data /root/n8n-data-backup

# Clear n8n data (WARNING: deletes all workflows and credentials!)
sudo rm -rf /docker/appdata/n8n/data/*

# Restart container
docker-compose restart n8n

# Re-import your workflows from backup or re-create them
```

---

## Community Packages Not Loading

### Issue: LangChain nodes don't appear in node picker

**Symptoms**:
- "@n8n/n8n-nodes-langchain" package not available in dropdown
- Node search returns no results for "OpenAI", "LM Chat", etc.
- Workflow validation fails saying community packages are disabled

**Diagnosis Steps**:
```bash
# Check environment variable is set correctly
docker-compose config | grep N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE

# View n8n startup logs for package loading messages
docker-compose logs n8n | grep -i "community"
```

**Solutions**:

#### Solution A: Verify Environment Variable
Ensure `.env` file contains:
```bash
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

Then restart containers:
```bash
docker-compose down
docker-compose up -d
```

Wait 30-60 seconds for packages to load on startup.

#### Solution B: Install Community Packages Manually (Advanced)
If automatic loading fails:
```bash
# Stop n8n container
docker-compose stop n8n

# Access the container shell
docker exec -it plexie-n8n sh

# Navigate to node_modules directory
cd /usr/src/app/node_modules/

# List available packages (should see @n8n/n8n-nodes-langchain)
ls -la | grep langchain

# If missing, install it:
npm install @n8n/n8n-nodes-langchain

# Exit container and restart n8n
exit
docker-compose start n8n
```

#### Solution C: Clear npm Cache
If package installation fails:
```bash
# On Plexie server:
docker exec -it plexie-n8n sh
cd /usr/src/app/node_modules
rm -rf @n8n
npm cache clean --force
exit
docker-compose restart n8n
```

---

## Workflow Validation Errors

### Issue: "Node configuration invalid" or expression errors in workflows

**Symptoms**:
- Workflow won't execute, red error indicators on nodes
- Console shows "Expression syntax error" or "Invalid node reference"
- LLM node fails with "Prompt template missing variable"

**Diagnosis Steps**:
```bash
# In n8n web interface:
# 1. Open the problematic workflow
# 2. Click on failing node
# 3. Check Expression Editor for red error markers
# 4. Hover over errors to see detailed messages
```

**Solutions**:

#### Solution A: Fix Expression Syntax Errors
Common issues and fixes:

| Error | Cause | Solution |
|-------|-------|----------|
| `{{ $json.field }}` → undefined | Field doesn't exist in previous node output | Check field name spelling, verify data flow between nodes |
| `{{ $node["Previous Node"].json.field }}` → null | Previous node didn't produce expected output | Add error handling or default values |
| `{{ $binary.data }}` → invalid binary reference | Binary data not properly attached to previous node | Check if file upload/download worked correctly |

**Example Fix**:
```javascript
// Before (will fail if field missing):
{{ $json.username }}

// After (with fallback):
{{ $json.username || "anonymous" }}
```

#### Solution B: Reset LLM Node Configuration
If LLM node shows configuration errors:
1. Open workflow in n8n editor
2. Click the problematic LLM node
3. In right sidebar, click **"Reset to defaults"** button (if available)
4. Re-select your credential from dropdown
5. Save and retry execution

#### Solution C: Use Expression Builder Instead of Manual Input
For complex expressions, use n8n's visual expression builder:
1. Click the field with the error
2. Look for "Expression" tab in input area
3. Use drag-and-drop interface to build expressions visually
4. This prevents syntax errors from manual typing

---

## Credential Configuration Issues

### Issue: "Credential not found" or authentication fails on LLM calls

**Symptoms**:
- Workflow execution error: "Credential 'OpenAI API' not found"
- HTTP request node returns 401 Unauthorized
- LLM node shows credential dropdown empty

**Diagnosis Steps**:
```bash
# In n8n web interface:
# 1. Go to Settings → Credentials
# 2. Verify your "LM Studio Local LLM" credential exists
# 3. Check if it's marked as active (green checkmark)
```

**Solutions**:

#### Solution A: Recreate Credential with Correct Details
1. Go to **Settings** → **Credentials** in n8n web interface
2. Click **"Add Credential"** button
3. Select **"OpenAI API"** (LM Studio uses OpenAI-compatible endpoint)
4. Fill in:
   - **Name**: `LM Studio Local LLM`
   - **Base URL**: `http://10.0.0.100:1234/v1`
   - **API Key**: `local-key` (any value, local servers don't require auth)
5. Click **"Save"**

#### Solution B: Verify Credential is Selected in Workflow
After creating credential:
1. Open your workflow in n8n editor
2. Click the LLM node that needs authentication
3. In right sidebar, find **"Credentials"** section
4. Select "OpenAI API" from dropdown
5. Choose your newly created credential

#### Solution C: Check Credential Permissions
Some credentials require specific scopes. For LM Studio local server:
- Ensure you're using the correct credential type (not "OAuth2", but "Basic Auth" or custom)
- If using "OpenAI API" credential type, ensure Base URL is correctly set

---

## Agent Output Format Issues

### Issue: LLM returns unexpected format that breaks downstream processing

**Symptoms**:
- Code Writer outputs text without code blocks
- Security Reviewer doesn't return valid JSON
- Planner generates tasks but they're not structured as expected

**Diagnosis Steps**:
```bash
# Check output from individual agent workflow executions:
# 1. Execute the specific agent workflow manually
# 2. View output in execution history
# 3. Inspect whether it matches expected format
```

**Solutions**:

#### Solution A: Strengthen System Prompt Instructions
For agents that don't return proper JSON:
1. Open workflow in n8n editor
2. Click the LLM node
3. Edit **"System Message"** or **"Prompt Template"** field
4. Add explicit format requirements:
   ```markdown
   IMPORTANT: Return ONLY valid JSON without any markdown formatting, code blocks, or explanatory text before/after. Example:
   
   {
     "field1": "value",
     "field2": ["array of values"]
   }
   
   Do not include any other text in your response.
   ```

#### Solution B: Use Code Node to Parse and Validate Output
Add a code node after the LLM node to handle malformed responses:
```javascript
// Try to parse JSON, fallback to default if fails
try {
  const parsed = JSON.parse($json.output || '{}');
  
  // Ensure required fields exist
  if (!parsed.security_score) {
    return [{
      json: {
        security_score: 5,
        critical_issues: [],
        high_priority: [],
        recommendations: ['Please review output format'],
        parsed_successfully: false
      }
    }];
  }
  
  return [{ json: parsed }];
} catch (error) {
  // Return safe default on parse failure
  return [{
    json: {
      security_score: 5,
      critical_issues: [],
      high_priority: [],
      recommendations: ['LLM output was not valid JSON'],
      original_output: $json.output,
      error_message: error.message
    }
  }];
}
```

#### Solution C: Adjust LLM Temperature
If model is too creative and ignores format instructions:
1. Open LLM node in workflow editor
2. Find **"Temperature"** parameter (usually in advanced settings)
3. Lower temperature value (e.g., from 0.7 to 0.3 for more deterministic output)
4. Save and retest

---

## Performance Issues

### Issue: Workflows run very slowly or timeout during execution

**Symptoms**:
- Workflow takes 5+ minutes to complete a single task
- LLM responses take >30 seconds each
- Execution times out with "Request timeout" error

**Diagnosis Steps**:
```bash
# Check n8n execution logs for timing information:
docker-compose logs n8n | grep -i "execution"

# Monitor resource usage during workflow execution:
htop  # On Plexie server terminal

# Check LM Studio response times manually:
time curl -X POST http://10.0.0.100:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-7b-instruct-v0.2",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Solutions**:

#### Solution A: Use Smaller Model for Faster Inference
If using a large model (e.g., 13B+ parameters):
1. Load a smaller model in LM Studio (e.g., mistral-7b instead of codellama-13b)
2. Update .env file with new model name:
   ```bash
   LOCAL_AI_MODEL=mistral-7b-instruct-v0.2
   ```

#### Solution B: Increase Execution Timeout
If workflows timeout due to slow LLM responses:
```yaml
# Edit docker-compose.yml and add execution timeout for n8n service:
services:
  n8n:
    environment:
      - EXECUTIONS_TIMEOUT=3600  # 1 hour in seconds (default is 3600)
      - EXECUTIONS_TIMEOUT_MAX=7200  # Maximum allowed timeout
```

Then restart containers.

#### Solution C: Enable Redis for Better Performance
If not already using Redis:
```bash
# Ensure Redis container is running:
docker-compose up -d redis

# Verify it's accessible from n8n:
docker exec plexie-n8n node -e "console.log('Redis connected:', process.env.REDIS_URL)"
```

#### Solution D: Run LLM Calls Sequentially Instead of Parallel
If multiple agents running in parallel causes slowdowns:
- Modify workflow to execute agents sequentially rather than concurrently
- This reduces concurrent load on LM Studio server

---

## General Debugging Commands

### Check Container Status
```bash
docker ps  # Shows all running containers
docker ps -a  # Shows ALL containers (including stopped ones)
docker-compose ps  # Shows only containers from docker-compose.yml
```

### View Container Logs
```bash
# All logs
docker-compose logs n8n

# Live tail of logs
docker-compose logs -f n8n

# Last 100 lines only
docker-compose logs --tail=100 n8n

# Specific time range (last hour)
docker-compose logs --since="1h" n8n
```

### Access Container Shell
```bash
# Enter n8n container shell
docker exec -it plexie-n8n sh

# Enter Redis container shell
docker exec -it plexie-redis redis-cli ping  # Test connection
```

### Inspect Network Configuration
```bash
# List Docker networks
docker network ls

# Inspect specific network details
docker network inspect n8n_n8n_default
```

---

## When to Ask for Help

If you've tried the solutions above and still encounter issues:

1. **Collect diagnostic information**:
   - Run `docker-compose logs -f n8n` during the error
   - Note exact error messages (copy-paste completely)
   - Document what steps you took before the error occurred

2. **Check existing resources**:
   - Review [README.md](https://github.com/eekanti/n8n-team/blob/main/README.md) for setup instructions
   - Check [docs/Plexie Server Setup Guide.md](https://github.com/eekanti/n8n-team/blob/main/docs/Plexie%20Server%20Setup%20Guide.md) for server-specific issues

3. **Common scenarios requiring support**:
   - Custom hardware configurations not covered here
   - Network topology with complex firewall rules
   - Integration with external services beyond LM Studio
   - Performance tuning for very large codebases or complex workflows

---

**Tip**: Most issues are resolved by checking the basics first:
1. ✅ Is LM Studio server running?
2. ✅ Can you `curl` to http://10.0.0.100:1234/v1/models from Plexie?
3. ✅ Are containers actually running (`docker ps`)?
4. ✅ Is the correct credential selected in n8n workflows?

Start there before diving into complex troubleshooting! 🛠️
