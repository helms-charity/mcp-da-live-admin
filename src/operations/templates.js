// src/operations/templates.js

import { z } from 'zod';
import { daAdminRequest, formatURL, uploadHTML } from '../common/utils.js';
import { buildLibraryPath, buildContentUrl, createLibraryJSON } from '../common/library-cfg-utils.js';
import { listSheetItems, addSheetItem, removeSheetItem } from '../common/sheet-utils.js';
import { LIBRARY_TYPES } from '../common/global.js';
import { registerLibraryType } from './config.js';

const ListTemplatesSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

const AddTemplateSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  templateName: z.string().describe('The template name (e.g., "Blog Template")'),
  sourcePage: z.string().describe('Source page path to copy content from (e.g., /ue-editor/demo)'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)'),
  preview: z.boolean().optional().default(false).describe('Preview mode (default: false)')
});

const RemoveTemplateSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  templateName: z.string().describe('The template name to remove'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

const SetupTemplatesSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  templates: z.array(z.object({
    name: z.string().describe('Template display name'),
    sourcePage: z.string().describe('Source page path')
  })).describe('Array of templates to create'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)'),
  preview: z.boolean().optional().default(false).describe('Preview mode (default: false)')
});

function getTemplatesPath(baseFolder) {
  return buildLibraryPath(LIBRARY_TYPES.TEMPLATES, baseFolder);
}

function createTemplatesJSON(entries) {
  return createLibraryJSON(LIBRARY_TYPES.TEMPLATES, entries);
}

function createTemplateSlug(templateName) {
  return templateName.toLowerCase().replace(/\s+/g, '-');
}

function buildResponse(args, additional = {}) {
  return {
    org: args.org,
    repo: args.repo,
    ...additional
  };
}

async function fetchPageContent(org, repo, path) {
  const url = formatURL('source', org, repo, path, 'html');
  return daAdminRequest(url);
}

async function uploadHTMLContent(org, repo, path, htmlContent) {
  const url = formatURL('source', org, repo, path, 'html');
  return uploadHTML(url, htmlContent);
}

async function addTemplate(org, repo, templateName, sourcePage, baseFolder = 'library', preview = false) {
  const result = {
    templateName,
    sourcePage,
    baseFolder,
    preview,
    steps: [],
    errors: []
  };

  try {
    result.steps.push({ step: 1, action: 'Fetching source page content', status: preview ? 'planned' : 'in_progress' });

    let htmlContent = null;
    if (!preview) {
      try {
        htmlContent = await fetchPageContent(org, repo, sourcePage);
        result.steps[0].status = 'completed';
        result.steps[0].sourceLength = htmlContent.length;
      } catch (error) {
        result.errors.push(`Failed to fetch source page: ${error.message}`);
        result.steps[0].status = 'failed';
        result.steps[0].error = error.message;
        return result;
      }
    } else {
      result.steps[0].status = 'planned';
    }

    const templateSlug = createTemplateSlug(templateName);
    const docPath = buildLibraryPath(LIBRARY_TYPES.TEMPLATES, baseFolder, templateSlug);
    const docUrl = buildContentUrl(org, repo, docPath);

    result.steps.push({ 
      step: 2, 
      action: preview ? 'Would create template document' : 'Creating template document',
      status: preview ? 'planned' : 'in_progress',
      docPath,
      docUrl
    });

    if (!preview) {
      await uploadHTMLContent(org, repo, docPath, htmlContent);
      result.steps[1].status = 'completed';
    }

    result.steps.push({ 
      step: 3, 
      action: preview ? 'Would add to templates.json' : 'Adding to templates.json',
      status: preview ? 'planned' : 'in_progress'
    });

    if (!preview) {
      const entry = { key: templateName, value: docUrl };
      const addResult = await addSheetItem(
        org,
        repo,
        entry,
        'key',
        getTemplatesPath(baseFolder),
        createTemplatesJSON
      );

      result.steps[2].status = 'completed';
      result.steps[2].existed = addResult.existed;
      
      // Always check and register if needed, not just on first create
      const configUrl = `${buildContentUrl(org, repo, getTemplatesPath(baseFolder))}.json`;
      const regResult = await registerLibraryType(org, repo, 'Templates', configUrl);
      result.registered = regResult.registered;
      result.alreadyRegistered = regResult.existed;
    }

    result.success = true;
    result.docPath = docPath;
    result.docUrl = docUrl;
    return result;

  } catch (error) {
    result.errors.push(error.message);
    result.success = false;
    return result;
  }
}

async function setupTemplates(org, repo, templates, baseFolder = 'library', preview = false) {
  const result = {
    baseFolder,
    preview,
    summary: {
      totalTemplates: templates.length,
      created: 0,
      failed: 0
    },
    templates: [],
    errors: []
  };

  for (const template of templates) {
    const templateResult = await addTemplate(
      org,
      repo,
      template.name,
      template.sourcePage,
      baseFolder,
      preview
    );

    result.templates.push({
      name: template.name,
      sourcePage: template.sourcePage,
      success: templateResult.success,
      docPath: templateResult.docPath,
      docUrl: templateResult.docUrl,
      errors: templateResult.errors
    });

    if (templateResult.success) {
      result.summary.created++;
    } else {
      result.summary.failed++;
      result.errors.push(...templateResult.errors);
    }
  }

  result.success = result.summary.failed === 0;
  
  if (!preview && result.summary.created > 0) {
    const configUrl = `${buildContentUrl(org, repo, getTemplatesPath(baseFolder))}.json`;
    const regResult = await registerLibraryType(org, repo, 'Templates', configUrl);
    result.registered = regResult.registered;
    result.librarySheet = {
      existed: !regResult.createdSheet,
      entryCount: regResult.libraryEntryCount
    };
  }
  
  return result;
}

export const tools = [
  {
    name: 'da_library_templates_list',
    description: 'List all templates from templates.json in the library',
    schema: ListTemplatesSchema,
    handler: async (args) => {
      const templates = await listSheetItems(args.org, args.repo, getTemplatesPath(args.baseFolder));
      return buildResponse(args, {
        baseFolder: args.baseFolder,
        totalTemplates: templates.length,
        templates
      });
    }
  },
  {
    name: 'da_library_add_template',
    description: 'Add a single template to the library. Copies content from source page and adds to templates.json. Automatically checks and registers Templates in site config library sheet if needed. Use preview=true to see plan.',
    schema: AddTemplateSchema,
    handler: async (args) => {
      const result = await addTemplate(
        args.org,
        args.repo,
        args.templateName,
        args.sourcePage,
        args.baseFolder,
        args.preview
      );
      return buildResponse(args, result);
    }
  },
  {
    name: 'da_library_templates_remove',
    description: 'Remove a template entry from templates.json',
    schema: RemoveTemplateSchema,
    handler: async (args) => {
      const result = await removeSheetItem(
        args.org,
        args.repo,
        args.templateName,
        'key',
        getTemplatesPath(args.baseFolder),
        createTemplatesJSON
      );
      
      return buildResponse(args, {
        templateName: args.templateName,
        baseFolder: args.baseFolder,
        ...result
      });
    }
  },
  {
    name: 'da_library_setup_templates',
    description: 'Batch setup templates. Creates template documents from source pages and updates templates.json. Automatically registers in library. Use preview=true to see plan.',
    schema: SetupTemplatesSchema,
    handler: async (args) => {
      const result = await setupTemplates(
        args.org,
        args.repo,
        args.templates,
        args.baseFolder,
        args.preview
      );
      return buildResponse(args, result);
    }
  }
];
