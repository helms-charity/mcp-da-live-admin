# DA Admin MCP Server

An MCP (Model Context Protocol) server that provides tools for interacting with the Document Authoring Admin API. This server allows you to manage content, versions, and configurations in DA repositories through MCP tools.

## Features

- List sources and directories in DA repositories
- Manage source content (get, create, delete)
- Handle content versioning
- Copy and move content between locations
- Manage configurations
- Lookup Media and Fragment References
- **Set Up Block Library** - Automatically create block documentation from GitHub repo code with real content from sample pages

## Cursor AI setup

To use this MCP server with Cursor AI, go to `Cursor Settings`, `MCP` and a `New global MCP server`. Add this entry to your list of `mcpServers`:

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

In the chat, you can then ask things like: `Via the DA Admin, give me the list of resources in <your_org>/<your_repo>/<path>`.

## GitHub Token Setup (Optional , Required if generating Block documents based on code in GH repo)

To use the block library features, add a `GITHUB_TOKEN` to your MCP config:

1. Generate token at: `https://github.com/settings/tokens/new`
2. Select scopes: `repo` and `read:org`
3. Add to MCP config `env`: `"GITHUB_TOKEN": "ghp_your_token_here"`

This increases GitHub API rate limit from 60 to 5,000 requests/hour.

## Usage

### Set Up Block Library

Create block documentation with real content from sample pages:

```
Set up block library for <org>/<repo> using sample page at <url>
```

The tool will:
- Discover all blocks from GitHub repo
- Extract real content from your sample page(s)
- Create block documentation with live examples
- Update library configuration

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT
