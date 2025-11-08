// src/common/block-utils.js

import { promises as fs } from 'fs';
import { resolve, join } from 'path';
import { createGitHubClient, getFileContent as ghGetFileContent, listDirectories as ghListDirectories } from './gh-utils.js';

async function detectLocalBlocksDir(startPath = process.cwd()) {
  try {
    const blocksPath = resolve(startPath, 'blocks');
    await fs.access(blocksPath);
    const stat = await fs.stat(blocksPath);
    return stat.isDirectory() ? blocksPath : null;
  } catch {
    return null;
  }
}

async function detectGitRemote(cwd = process.cwd()) {
  try {
    const gitConfig = await fs.readFile(join(cwd, '.git', 'config'), 'utf-8');
    const remoteMatch = gitConfig.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/);
    
    if (remoteMatch) {
      const url = remoteMatch[1].trim();
      const githubMatch = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      
      if (githubMatch) {
        return {
          org: githubMatch[1],
          repo: githubMatch[2].replace(/\.git$/, ''),
          remote: url
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function createLocalSource(blocksPath) {
  return {
    type: 'local',
    
    async getFileContent(path) {
      try {
        const fullPath = join(blocksPath, path);
        return await fs.readFile(fullPath, 'utf-8');
      } catch {
        return null;
      }
    },
    
    async listDirectories() {
      try {
        const entries = await fs.readdir(blocksPath, { withFileTypes: true });
        return entries
          .filter(entry => entry.isDirectory())
          .map(entry => ({ name: entry.name, type: 'dir' }));
      } catch {
        return [];
      }
    },
    
    async fileExists(path) {
      try {
        const fullPath = join(blocksPath, path);
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    },
    
    async listFiles(blockName) {
      try {
        const blockPath = join(blocksPath, blockName);
        const entries = await fs.readdir(blockPath);
        return entries.filter(name => name.endsWith('.js') || name.endsWith('.css'));
      } catch {
        return [];
      }
    }
  };
}

function createGitHubSource(org, repo, branch = 'main', blocksPath = 'blocks') {
  const octokit = createGitHubClient();
  
  return {
    type: 'github',
    
    async getFileContent(path) {
      try {
        return await ghGetFileContent(octokit, org, repo, `${blocksPath}/${path}`, branch);
      } catch {
        return null;
      }
    },
    
    async listDirectories() {
      try {
        return await ghListDirectories(octokit, org, repo, blocksPath, branch);
      } catch {
        return [];
      }
    },
    
    async fileExists(path) {
      try {
        await octokit.repos.getContent({
          owner: org,
          repo,
          path: `${blocksPath}/${path}`,
          ref: branch
        });
        return true;
      } catch {
        return false;
      }
    },
    
    async listFiles(blockName) {
      try {
        const response = await octokit.repos.getContent({
          owner: org,
          repo,
          path: `${blocksPath}/${blockName}`,
          ref: branch
        });
        const files = Array.isArray(response.data) ? response.data : [response.data];
        return files
          .filter(f => f.type === 'file' && (f.name.endsWith('.js') || f.name.endsWith('.css')))
          .map(f => f.name);
      } catch {
        return [];
      }
    }
  };
}

export function createBlockSource(config) {
  if (config.useLocal || config.localBlocksPath) {
    const blocksPath = config.localBlocksPath || detectLocalBlocksDir();
    if (!blocksPath) {
      throw new Error('No local blocks directory found');
    }
    return createLocalSource(blocksPath);
  }
  
  if (config.github) {
    return createGitHubSource(
      config.github.org,
      config.github.repo,
      config.github.branch,
      config.github.blocksPath
    );
  }
  
  const localPath = detectLocalBlocksDir();
  if (localPath) {
    return createLocalSource(localPath);
  }
  
  throw new Error('No block source configured. Provide github config or run from an EDS project directory.');
}

export async function resolveBlockSource(args) {
  if (args.github) {
    return {
      source: createGitHubSource(
        args.github.org,
        args.github.repo,
        args.github.branch || 'main',
        args.github.blocksPath || 'blocks'
      ),
      metadata: {
        type: 'github',
        ...args.github
      }
    };
  }
  
  if (args.useLocal) {
    const blocksPath = args.localBlocksPath || await detectLocalBlocksDir();
    if (!blocksPath) {
      throw new Error('Local blocks directory not found');
    }
    const gitMetadata = await detectGitRemote();
    return {
      source: createLocalSource(blocksPath),
      metadata: { type: 'local', path: blocksPath, git: gitMetadata }
    };
  }
  
  const localPath = await detectLocalBlocksDir();
  if (localPath) {
    const gitMetadata = await detectGitRemote();
    return {
      source: createLocalSource(localPath),
      metadata: { type: 'local', path: localPath, git: gitMetadata }
    };
  }
  
  throw new Error(
    'No block source specified. Either:\n' +
    '1. Provide github: { org, repo } for remote source\n' +
    '2. Set useLocal: true for local blocks\n' +
    '3. Run from an EDS project directory (auto-detect)'
  );
}

export { detectLocalBlocksDir, detectGitRemote };

