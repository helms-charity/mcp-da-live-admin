#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import * as list from './operations/list.js';
import * as source from './operations/source.js';
import * as media from './operations/media.js';
import * as config from './operations/config.js';
import * as blocks from './operations/blocks.js';
import * as library from './operations/library.js';
import * as templates from './operations/templates.js';
import * as placeholders from './operations/placeholders.js';
import * as icons from './operations/icons.js';
import * as librarySetup from './operations/library-setup.js';
import { VERSION } from './common/global.js';

const server = new Server(
  {
    name: 'da-live-mcp-server',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: `
      You are a helpful assistant that provides tools to perform tasks related to the https://da.live platform, leveraging the https://docs.da.live/ admin API.
      DA stands for Document Authoring. The internal project name was known as "Dark Alley".
      DA, DA Live, da.live and Dark Alley are all the same platform.
      DA Live Admin API is the API used to manage the content on the DA Live platform.
      org is an organization name.
      repo is a repository name.
      path is a path to a file or folder in the content of the repository.
      Quite often, <org>/<repo>/<path> is used to refer to a specific file or folder in the content of the repository. <path> may contain multiple slashes.
      Using for example myorg/myrepo/myfolder/myfile.html refers to the myorg org, myrepo repo and file at /myfolder/myfile.html.
      Admin content can be accessed via: https://admin.da.live/source/<org>/<repo>/<path>.<extension>
      Published content can be accessed via: https://content.da.live/<org>/<repo>/<path>

      Media tools allow you to lookup media and fragment references from sites.
      References are stored in .da/mediaindex/media.json and include all images, videos, documents, and fragments used across pages.

      Library management tools allow you to:
      - Discover blocks from LOCAL file system or GitHub repositories
      - Create block documentation in DA
      - Manage library configurations (blocks.json, templates.json, placeholders.json, icons.json)
      - Register library types in site configuration

      Library types:
      - Blocks: Multi-sheet JSON with name/path columns and options sheet. Stored at /library/blocks/
      - Templates: Single-sheet JSON with key/value columns. Stored at /library/templates/
      - Placeholders: Single-sheet JSON with Key/Text columns. Configurable path (default: /placeholders.json)
      - Icons: Single-sheet JSON with key/icon columns. Stored at /library/icons/

      Library structure:
      - Site config at /config/{org}/{repo} contains a "library" sheet that registers library types
      - Block paths in library configs use content.da.live domain format
      
      Block Sources (THREE OPTIONS):
      1. LOCAL (auto-detect): If run from an EDS project directory with blocks/ folder, blocks are read from LOCAL file system
      2. LOCAL (explicit): Set useLocal: true to explicitly use local blocks
      3. GITHUB (explicit): Provide github: { org, repo, branch } to fetch from GitHub API (for repoless setups)
      
      IMPORTANT: 
      - By DEFAULT, tools will AUTO-DETECT and prefer LOCAL blocks if ./blocks exists
      - Only use GitHub source if explicitly requested or when setting up from a different repo (repoless)
      - DA org/repo (destination) is separate from block source (local or GitHub)
      
      GitHub integration (when using GitHub source):
      - Requires GITHUB_TOKEN environment variable for private repositories
      - Public repositories can be accessed without token (with rate limits)
      - Blocks are discovered from /blocks folder (or custom path like aemedge/blocks)
    `,
  }
);

const tools = [
  ...list.tools,
  ...source.tools,
  ...media.tools,
  ...config.tools,
  ...blocks.tools,
  ...library.tools,
  ...templates.tools,
  ...placeholders.tools,
  ...icons.tools,
  ...librarySetup.tools,
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    const tool = tools.find((t) => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const args = tool.schema.parse(request.params.arguments);
    const result = await tool.handler(args);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid input: ${JSON.stringify(error.errors)}`);
    }
    throw error;
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DA Admin MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});