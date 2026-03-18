## Expression Language

### Basic Syntax
Use `{{ }}` to evaluate expressions anywhere in the UI.

**Examples:**
```javascript
// Access JSON field from current item
{{ $json.email }}

// String interpolation
{{ 'Hello, ' + $json.name }}

// Conditional expression
{{ $json.score > 80 ? 'Pass' : 'Fail' }}

// Array operations
{{ $json.tags[0] }} // First element
{{ $json.items.length }} // Array length
```

### Accessing Data from Other Nodes
```javascript
// Access data from previous node by name
{{ $('Previous Node Name').item.json.field }}

// Access specific item index from another node
{{ $('HTTP Request').item.json[5].data }}

// Use $node shortcut for previous node in same branch
{{ $node['HTTP Request'].json.result }}
```

### Date Functions (luxon)
n8n includes luxon for date manipulation:
```javascript
// Current date/time
{{ $today }} // luxon DateTime object

// Format date
{{ $today.toFormat('yyyy-MM-dd') }}
{{ $today.plus({ days: 7 }).toISODate() }}

// Timezone-aware
{{ $now.setZone('America/New_York').toFormat('HH:mm:ss ZZZZ') }}
```

### JMESPath Queries
Use `$jmespath` for powerful JSON querying:
```javascript
// Find items matching criteria
{{ $jmespath($json.items, '[?status==`active`].name') }}

// Extract specific field from array
{{ $jmespath($json.users, '[*].email') }}

// Nested access
{{ $jmespath($json.data, 'metadata.tags[0]') }}
```

## Common Node Patterns

### HTTP Request Node Best Practices
**Required:** `url` (include protocol: `https://`)

**Common configurations:**
- **Authentication:** Use Predefined Credential Types for OAuth2/API keys
- **SSL Verification:** Set `allowUnauthorizedCerts: true` for self-signed certs
- **Timeouts:** Configure `requestTimeout` for slow endpoints
- **Response Parsing:** Use `responseType: json` (default) or `binary`

**Example Portainer API call:**
```javascript
{
  "url": "https://portainer:9443/api/endpoints/3/docker/containers/json",
  "authentication": "predefinedCredentialType",
  "credentialType": "httpHeaderAuthGeneric",
  "sendHeaders": true,
  "headerParameters": [
    {
      "name": "X-API-Key",
      "value": "{{ $env.PORTAINER_API_KEY }}"
    }
  ],
  "allowUnauthorizedCerts": true
}
```

### Webhook Node Patterns
**Trigger types:**
- `onReceived`: Immediate response (fastest)
- `lastNode`: Wait for entire workflow to complete
- `responseNode`: Use Respond to Webhook node for custom control

**Dynamic paths:**
```javascript
// Static: /webhook/my-webhook
// Dynamic: /webhook/:id (e.g., /webhook/123, /webhook/abc)
```

### Code Node Patterns
**JavaScript modes:**
- `runOnceForAllItems`: Process all items as one array (faster for bulk ops)
- `runOnceForEachItem`: Execute once per item (useful for complex transformations)

**Example: Transform and filter items**
```javascript
// runOnceForAllItems mode
const items = $input.all();
return items
  .filter(item => item.json.status === 'active')
  .map(item => ({
    ...item,
    json: {
      ...item.json,
      processedAt: new Date().toISOString(),
      formattedName: item.json.name.toUpperCase()
    }
  }));

// runOnceForEachItem mode (default)
const item = $input.first();
if (item.json.score >= 80) {
  return [{ json: { ...item.json, passed: true } }];
} else {
  return [{ json: { ...item.json, passed: false } }];
}
```

**Python mode (Beta):**
```python
# runOnceForAllItems
items = _input.all()
return [
    {
        "json": {
            **item["json"],
            "processed_at": datetime.now().isoformat(),
            "name_upper": item["json"]["name"].upper()
        }
    }
    for item in items if item["json"]["status"] == "active"
]
```

### If Node Patterns
**Multiple conditions:**
```javascript
// AND logic
{{ $json.score >= 80 && $json.attendance > 90 }}

// OR logic  
{{ $json.status === 'urgent' || $json.priority === 'high' }}

// Complex condition
{{ ($json.score >= 70 && $json.attendance > 85) || $json.exemption === true }}
```

### Error Handling Patterns

**Try-Catch with Code Node:**
```javascript
try {
  const result = await $httpRequest({
    url: $json.apiEndpoint,
    method: 'POST',
    body: $json.payload
  });
  
  return [{ json: { success: true, data: result } }];
} catch (error) {
  return [{ 
    json: { 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    } 
  }];
}
```

**Error Trigger Workflow:**
Use `n8n-nodes-base.errorTrigger` node to catch workflow errors globally. This starts a separate workflow when any connected workflow fails.

## AI Agent Integration

### AI Agent Node Setup
**Location:** Under `@n8n/n8n-nodes-langchain` package

**Required connections:**
- Main LLM (e.g., ChatOpenAI, ChatAnthropic)
- Tools (optional): HTTP Request node can be used as tool
- Output Parser (optional): For structured output requirements

**Prompt types:**
1. `auto`: Pulls prompt from connected Chat Trigger node
2. `guardrails`: Uses connected Guardrails node for safety filtering
3. `define`: Manually define prompt in the node parameters

**Example: HTTP Request as Tool**
```javascript
// In AI Agent's tool configuration, connect an HTTP Request node
// The agent will call this node when it needs to fetch external data
// Configure with appropriate authentication and URL parameters
```

### Structured Output with Output Parser
When you need specific JSON format from the agent:
1. Add `@n8n/n8n-nodes-langchain.outputParserStructured` node
2. Define schema in the parser (e.g., `{ "title": "string", "description": "string" }`)
3. Connect to AI Agent's output parser input port

**Use case:** Generate consistent JSON for API calls or database inserts

### Fallback Model Pattern
For production reliability:
1. Enable `needsFallback` in AI Agent settings
2. Connect secondary LLM as fallback connection
3. Main model handles routine requests, fallback activates on errors

## Debugging Tips for AI Agents

**Common issues and solutions:**

| Issue | Solution |
|-------|----------|
| Agent loops infinitely | Add output parser with max iterations limit |
| Returns empty results | Check prompt clarity and tool availability |
| Authentication failures | Verify credential connections in HTTP Request tools |
| Slow response times | Use simpler prompts or faster models |

**Debug workflow:**
1. Add `Code` node after AI Agent to log outputs
2. Use $input.all() to inspect all items: `console.log($input.all())`
3. Check execution history for error details in n8n UI

## Workflow Optimization Tips

### Execution Performance
- **Use runOnceForAllItems** in Code nodes when possible (faster than per-item)
- **Minimize HTTP requests** by batching data where supported
- **Use Set node** instead of Code for simple field mappings
- **Enable saveDataErrorExecution: none** in workflow settings to reduce storage

### Memory Management
```javascript
// Workflow Settings → Save Data
saveDataErrorExecution: "none"  // Don't save failed executions
saveDataSuccessExecution: "all" // Or "none" for very high volume workflows
```

### Conditional Execution with If
Use If nodes strategically to skip unnecessary processing:
- Check authentication before API calls
- Filter empty/null values early in workflow
- Route different data types to specialized processors

## Testing and Deployment

### Webhook Testing
**Using curl:**
```bash
curl -X POST https://n8n.example.com/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Using n8n UI:**
- Click "Test Workflow" button in editor
- Or use "Execute Workflow" from workflow list

### Version Control Best Practices
1. **Export workflows regularly** as JSON files
2. **Use meaningful names** for workflows (e.g., "Production - Server Health Monitor")
3. **Tag workflows** by environment: `prod`, `staging`, `development`
4. **Document complex logic** in node notes/comments

## Common Use Cases & Templates

### Daily Scheduled Tasks
**Cron expressions:**
```javascript
// Midnight daily (America/New_York timezone)
0 0 * * *

// Every hour at minute 30
30 * * * *

// Monday-Friday at 9 AM
0 9 * * 1-5

// Custom schedule in n8n UI:
// Cron: "0 0 * * *" → Timezone: America/New_York
```

### Container Health Monitoring (Portainer)
**HTTP Request node config for container status:**
```javascript
{
  "url": "https://portainer:9443/api/endpoints/3/docker/containers/json",
  "authentication": "httpHeaderAuthGeneric",
  "credentialType": "httpHeaderAuthGeneric",
  "headerParameters": [
    { "name": "X-API-Key", "value": "{{ $env.PORTAINER_API_KEY }}" }
  ],
  "allowUnauthorizedCerts": true,
  "responseType": "json"
}

// Parse result in Code node:
const containers = $input.first().json;
const unhealthy = containers.filter(c => c.State !== 'running');
return [{ json: { total: containers.length, running: containers.length - unhealthy.length, unhealthy } }];
```

### Disk Usage Monitoring
**Execute Command node (inside n8n container):**
```javascript
// Check root filesystem
df / | awk 'NR==2 {print $5}' // Returns percentage like "75%"

// Check ZFS tank pool
df /data | awk 'NR==2 {print $5}'

// Parse in Code node:
const usage = parseInt($input.first().json.split('\n')[1].trim().split(' ')[4]);
return [{ json: { usagePercent: usage, alertNeeded: usage > 85 } }];
```

## Troubleshooting

### Execute Command Node Shows "Install this node"
**Cause:** Missing environment variables
**Solution:** Ensure both are set in n8n container:
- `NODES_EXCLUDE=[]` (empty array)
- `N8N_EXECUTABLE_COMMAND_ENABLED=true`

### zpool Commands Fail Inside Container
**Cause:** Alpine/musl incompatibility with host glibc binaries
**Symptoms:** Hundreds of "missing symbol" errors when running `/sbin/zpool`

**Workarounds:**
1. Use `df /data` instead (works because /data is mounted)
2. For complex ZFS operations, use SSH node to run commands on host
3. Monitor via Beszel which already collects this data

### MCP Gateway Partial Update Fails
**Symptom:** "request/body must NOT have additional properties"

**Cause:** Mixing `addNode` with connection operations in one call

**Solution:** Use correct tool for each operation:
- **Add/remove nodes or connections:** `n8n_update_full_workflow`
- **Parameter edits only:** `n8n_update_partial_workflow`
- **Never pass `intent` parameter** (causes schema error)

### Workflow Won't Activate
**Common causes:**
1. Webhook node missing path configuration
2. HTTP Request nodes without valid credentials
3. Code nodes with syntax errors (check execution history)
4. Schedule trigger in wrong timezone for your region

**Check:** Execution history → Failed executions → Error details