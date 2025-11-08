// src/operations/icons.js

import { z } from 'zod';
import { buildLibraryPath, buildContentUrl, createLibraryJSON } from '../common/library-cfg-utils.js';
import { listSheetItems, addSheetItem, removeSheetItem, setupSheetItems } from '../common/sheet-utils.js';
import { LIBRARY_TYPES } from '../common/global.js';
import { registerLibraryType } from './config.js';

const ListIconsSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

const AddIconSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  key: z.string().describe('Icon key (e.g., "search", "email")'),
  icon: z.string().describe('Icon URL (e.g., https://content.da.live/org/repo/media/icons/search.svg)'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

const RemoveIconSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  key: z.string().describe('Icon key to remove'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

const SetupIconsSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  icons: z.array(z.object({
    key: z.string().describe('Icon key'),
    icon: z.string().describe('Icon URL')
  })).describe('Array of icons to create'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

function getIconsPath(baseFolder) {
  return buildLibraryPath(LIBRARY_TYPES.ICONS, baseFolder);
}

function createIconsJSON(entries) {
  return createLibraryJSON(LIBRARY_TYPES.ICONS, entries);
}

function createIconEntry(item) {
  return { key: item.key, icon: item.icon };
}

function buildResponse(args, additional = {}) {
  return {
    org: args.org,
    repo: args.repo,
    baseFolder: args.baseFolder,
    ...additional
  };
}

export const tools = [
  {
    name: 'da_library_icons_list',
    description: 'List all icons from icons.json in the library',
    schema: ListIconsSchema,
    handler: async (args) => {
      const icons = await listSheetItems(args.org, args.repo, getIconsPath(args.baseFolder));
      return buildResponse(args, {
        totalIcons: icons.length,
        icons
      });
    }
  },
  {
    name: 'da_library_add_icon',
    description: 'Add or update an icon in icons.json. Automatically checks and registers Icons in site config library sheet if needed.',
    schema: AddIconSchema,
    handler: async (args) => {
      const result = await addSheetItem(
        args.org,
        args.repo,
        createIconEntry(args),
        'key',
        getIconsPath(args.baseFolder),
        createIconsJSON
      );
      
      // Always check and register if needed, not just on first create
      const configUrl = `${buildContentUrl(args.org, args.repo, getIconsPath(args.baseFolder))}.json`;
      const regResult = await registerLibraryType(args.org, args.repo, 'Icons', configUrl);
      result.registered = regResult.registered;
      result.alreadyRegistered = regResult.existed;
      
      return buildResponse(args, result);
    }
  },
  {
    name: 'da_library_icons_remove',
    description: 'Remove an icon from icons.json',
    schema: RemoveIconSchema,
    handler: async (args) => {
      const result = await removeSheetItem(
        args.org,
        args.repo,
        args.key,
        'key',
        getIconsPath(args.baseFolder),
        createIconsJSON
      );
      
      return buildResponse(args, { key: args.key, ...result });
    }
  },
  {
    name: 'da_library_setup_icons',
    description: 'Batch setup icons. Creates or updates multiple icons in icons.json. Automatically registers in library.',
    schema: SetupIconsSchema,
    handler: async (args) => {
      const result = await setupSheetItems(
        args.org,
        args.repo,
        args.icons,
        'key',
        getIconsPath(args.baseFolder),
        createIconsJSON,
        createIconEntry
      );
      
      const configUrl = `${buildContentUrl(args.org, args.repo, getIconsPath(args.baseFolder))}.json`;
      const regResult = await registerLibraryType(args.org, args.repo, 'Icons', configUrl);
      result.registered = regResult.registered;
      result.librarySheet = {
        existed: !regResult.createdSheet,
        entryCount: regResult.libraryEntryCount
      };
      
      return buildResponse(args, result);
    }
  }
];
