# DA Admin MCP Server

An MCP (Model Context Protocol) server that provides tools for interacting with the Document Authoring Admin API. This server allows you to manage content, versions, and configurations in DA repositories through MCP tools.

## Features

- List sources and directories in DA repositories
- Manage source content (get, create, delete)
- Handle content versioning
- Copy and move content between locations
- Manage configurations
- Lookup Media and Fragment References
- **Set Up Block Library** - Automatically create block documentation from local EDS project or GitHub repo with real content examples from your pages. Manage templates, placeholders, and icons. Auto-registers everything in your library configuration

## DA Admin API Token Setup

### Method 1: Extract Token from DA Live (Recommended for Quick Testing)

1. Login to [https://da.live](https://da.live)
2. Create a browser bookmark with this JavaScript code:

```javascript
javascript:(function(){try{const keys=Object.keys(localStorage).filter(k=>k.startsWith('adobeid_ims_access_token'));if(!keys.length){alert('Token not found. Make sure you are on da.live');return;}let token,expire;for(const k of keys){const data=JSON.parse(localStorage.getItem(k));if(data.valid){token=data.tokenValue;expire=data.expire;break;}}if(!token){alert('No valid token found. Please login again.');return;}navigator.clipboard.writeText(token).then(()=>{const expireDate=expire?new Date(expire).toLocaleString():'Unknown';alert(`Token copied to clipboard!\n\nExpires: ${expireDate}`);}).catch(()=>{const t=document.createElement('textarea');t.value=token;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);alert('Token copied!');});}catch(e){alert('Error: '+e.message);}})();
```

3. Click the bookmarklet on da.live to copy the valid token
4. Tokens typically expire after 24 hours

### Method 2: Adobe Prerelease Program (For Production Use)

For long-term or production usage, join the Adobe Prerelease program:

1. Apply at: [https://www.adobeprerelease.com/beta/B3739D7D-1860-4197-9378-52EC0E75B1E5/apply](https://www.adobeprerelease.com/beta/B3739D7D-1860-4197-9378-52EC0E75B1E5/apply)
2. Once approved, follow Adobe's documentation for obtaining API credentials
3. This method provides more stable, longer-lived tokens with proper API access

## Cursor AI Setup

To use this MCP server with Cursor AI, go to `Cursor Settings`, `MCP` and add a `New global MCP server`. Add this entry to your list of `mcpServers`:

```json
"da-live-media": {
  "command": "npx",
  "args": [
    "https://github.com/kmurugulla/mcp-da-live-admin"
  ],
  "env": {
    "DA_ADMIN_API_TOKEN": "your_api_token_here",
    "GITHUB_TOKEN": "ghp_your_token_here"
  }
}
```

**Troubleshooting Token Issues:**
- If you receive `401 Unauthorized` or `403 Forbidden` errors, your token may be expired
- Re-login to da.live and extract a fresh token using the bookmarklet
- Restart Cursor after updating the token in MCP settings



## GitHub Token Setup (Optional, Required if generating Block documents based on code in GH repo)

To use the block library features, add a `GITHUB_TOKEN` to your MCP config:

1. Go to: [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. Set token name (e.g., "DA Live MCP Server - Read Only")
3. **Select ONLY the minimum required scope:**

   **If working with PUBLIC repositories only:**
   - ✅ `public_repo` - Access public repositories
   - ❌ Leave everything else unchecked

   **If working with PRIVATE repositories:**
   - ✅ `repo` - Access private repositories (read-only usage, GitHub doesn't offer granular read-only scope)
   - ❌ Leave everything else unchecked

4. Click "Generate token" and copy it immediately (you won't see it again)
5. Add to MCP config `env`: `"GITHUB_TOKEN": "ghp_your_token_here"`

**Why we need this:**
- Read block code (JavaScript/CSS) from your GitHub repository
- Increases API rate limit from 60 to 5,000 requests/hour

**What we DON'T need:**
- ❌ `read:org` - Not required
- ❌ `workflow` - Not required
- ❌ `write:packages` - Not required
- ❌ Any other scopes - Not required

**Note:** The MCP server only reads files from your repository. It never writes, commits, or modifies your GitHub data.

## Usage

### Set Up Block Library

Create block documentation with real content from sample pages:

**Examples:**

Set up complete block library:
```
Set up block library in kmurugulla/brightspath with example content from homepage and /ue-editor/demo pages
```

Create a template:
```
Create a template called "Blog" based on the document at /blogs/article in kmurugulla/brightspath
```

Add a placeholder:
```
Add a placeholder for Telephone mapped to 1-800-123-4567 in kmurugulla/brightspath
```

Update block documentation:
```
Update Cards Block documentation in library with example from /drafts/mycard-demo in kmurugulla/brightspath
```

Delete a block from library:
```
Delete the Cards block from library in kmurugulla/brightspath
```

Update a template:
```
Update the "Blog" template based on the document at /blogs/new-article in kmurugulla/brightspath
```

Delete a template:
```
Delete the "Blog" template from library in kmurugulla/brightspath
```

Update a placeholder:
```
Update placeholder for Telephone to 1-800-999-8888 in kmurugulla/brightspath
```

Delete a placeholder:
```
Delete the Telephone placeholder in kmurugulla/brightspath
```


## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT
