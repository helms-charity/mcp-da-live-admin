// src/operations/placeholders.js

import { z } from 'zod';
import { buildContentUrl, createLibraryJSON } from '../common/library-cfg-utils.js';
import { listSheetItems, addSheetItem, removeSheetItem, setupSheetItems } from '../common/sheet-utils.js';
import { LIBRARY_TYPES } from '../common/global.js';
import { registerLibraryType } from './config.js';

const ListPlaceholdersSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  configPath: z.string().optional().default('').describe('Optional folder path (default: root level as /placeholders)')
});

const AddPlaceholderSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  key: z.string().describe('Placeholder key (e.g., "site-title")'),
  text: z.string().describe('Placeholder text value'),
  configPath: z.string().optional().default('').describe('Optional folder path (default: root level as /placeholders)')
});

const RemovePlaceholderSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  key: z.string().describe('Placeholder key to remove'),
  configPath: z.string().optional().default('').describe('Optional folder path (default: root level as /placeholders)')
});

const SetupPlaceholdersSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  placeholders: z.array(z.object({
    key: z.string().describe('Placeholder key'),
    text: z.string().describe('Placeholder text')
  })).describe('Array of placeholders to create'),
  configPath: z.string().optional().default('').describe('Optional folder path (default: root level as /placeholders)')
});

function getPlaceholdersPath(configPath) {
  // If no configPath, place at root: /placeholders
  // If configPath provided, place in that folder: /configPath/placeholders
  if (!configPath || configPath === '') {
    return '/placeholders';
  }
  const cleanPath = configPath.startsWith('/') ? configPath.slice(1) : configPath;
  return `/${cleanPath}/placeholders`;
}

function createPlaceholdersJSON(entries) {
  return createLibraryJSON(LIBRARY_TYPES.PLACEHOLDERS, entries);
}

function createPlaceholderEntry(item) {
  return { key: item.key, value: item.text };
}

function buildResponse(args, additional = {}) {
  return {
    org: args.org,
    repo: args.repo,
    configPath: args.configPath,
    ...additional
  };
}

export const tools = [
  {
    name: 'da_library_placeholders_list',
    description: 'List all placeholders from placeholders.json',
    schema: ListPlaceholdersSchema,
    handler: async (args) => {
      const placeholders = await listSheetItems(args.org, args.repo, getPlaceholdersPath(args.configPath));
      return buildResponse(args, {
        totalPlaceholders: placeholders.length,
        placeholders
      });
    }
  },
  {
    name: 'da_library_add_placeholder',
    description: 'Add or update a placeholder in placeholders.json. Automatically checks and registers Placeholders in site config library sheet if needed.',
    schema: AddPlaceholderSchema,
    handler: async (args) => {
      const result = await addSheetItem(
        args.org,
        args.repo,
        createPlaceholderEntry(args),
        'key',
        getPlaceholdersPath(args.configPath),
        createPlaceholdersJSON
      );
      
      // Always check and register if needed, not just on first create
      const configUrl = `${buildContentUrl(args.org, args.repo, getPlaceholdersPath(args.configPath))}.json`;
      const regResult = await registerLibraryType(args.org, args.repo, 'Placeholders', configUrl);
      result.registered = regResult.registered;
      result.alreadyRegistered = regResult.existed;
      
      return buildResponse(args, result);
    }
  },
  {
    name: 'da_library_placeholders_remove',
    description: 'Remove a placeholder from placeholders.json',
    schema: RemovePlaceholderSchema,
    handler: async (args) => {
      const result = await removeSheetItem(
        args.org,
        args.repo,
        args.key,
        'key',
        getPlaceholdersPath(args.configPath),
        createPlaceholdersJSON
      );
      
      return buildResponse(args, { key: args.key, ...result });
    }
  },
  {
    name: 'da_library_setup_placeholders',
    description: 'Batch setup placeholders. Creates or updates multiple placeholders in placeholders.json. Automatically registers in library.',
    schema: SetupPlaceholdersSchema,
    handler: async (args) => {
      const result = await setupSheetItems(
        args.org,
        args.repo,
        args.placeholders,
        'key',
        getPlaceholdersPath(args.configPath),
        createPlaceholdersJSON,
        createPlaceholderEntry
      );
      
      const configUrl = `${buildContentUrl(args.org, args.repo, getPlaceholdersPath(args.configPath))}.json`;
      const regResult = await registerLibraryType(args.org, args.repo, 'Placeholders', configUrl);
      result.registered = regResult.registered;
      result.librarySheet = {
        existed: !regResult.createdSheet,
        entryCount: regResult.libraryEntryCount
      };
      
      return buildResponse(args, result);
    }
  }
];
