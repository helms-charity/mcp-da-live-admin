// src/operations/blocks.js

import { z } from 'zod';
import { resolveBlockSource } from '../common/block-utils.js';
import { daAdminRequest, formatURL, uploadHTML } from '../common/utils.js';
import { buildLibraryPath, buildContentUrl } from '../common/library-cfg-utils.js';
import { validateBlockName } from '../common/validation-utils.js';
import { LIBRARY_TYPES } from '../common/global.js';

const AnalyzeBlockSchema = z.object({
  blockName: z.string().describe('The block name to analyze'),
  github: z.object({
    org: z.string(),
    repo: z.string(),
    branch: z.string().optional().default('main'),
    blocksPath: z.string().optional().default('blocks')
  }).optional().describe('ONLY provide if explicitly fetching from a different GitHub repo. Omit to auto-detect local blocks.'),
  useLocal: z.boolean().optional().describe('Explicitly use local file system. Omit to auto-detect.'),
  localBlocksPath: z.string().optional().describe('Custom path to local blocks directory. Omit to use ./blocks')
});

const GenerateTemplateSchema = z.object({
  blockName: z.string().describe('The block name'),
  description: z.string().optional().describe('Optional description for the block'),
  variants: z.array(z.string()).optional().describe('Optional array of variant names'),
  structure: z.object({
    hasImage: z.boolean().optional(),
    hasHeading: z.boolean().optional(),
    hasButton: z.boolean().optional(),
    hasMultipleItems: z.boolean().optional(),
    classes: z.array(z.string()).optional()
  }).optional().describe('Optional structure information from block analysis')
});

const CreateDocSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  blockName: z.string().describe('The block name'),
  htmlContent: z.string().describe('The HTML content for the documentation'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

const CheckDocExistsSchema = z.object({
  org: z.string().describe('The organization name'),
  repo: z.string().describe('The repository name'),
  blockName: z.string().describe('The block name'),
  baseFolder: z.string().optional().default('library').describe('Base folder for library (default: library)')
});

const ListBlocksSchema = z.object({
  github: z.object({
    org: z.string(),
    repo: z.string(),
    branch: z.string().optional().default('main'),
    blocksPath: z.string().optional().default('blocks')
  }).optional().describe('ONLY provide if explicitly fetching from a different GitHub repo. Omit to auto-detect local blocks.'),
  useLocal: z.boolean().optional().describe('Explicitly use local file system. Omit to auto-detect.'),
  localBlocksPath: z.string().optional().describe('Custom path to local blocks directory. Omit to use ./blocks')
});

const GetBlockFilesSchema = z.object({
  blockName: z.string().describe('The block name (folder name)'),
  github: z.object({
    org: z.string(),
    repo: z.string(),
    branch: z.string().optional().default('main'),
    blocksPath: z.string().optional().default('blocks')
  }).optional().describe('ONLY provide if explicitly fetching from a different GitHub repo. Omit to auto-detect local blocks.'),
  useLocal: z.boolean().optional().describe('Explicitly use local file system. Omit to auto-detect.'),
  localBlocksPath: z.string().optional().describe('Custom path to local blocks directory. Omit to use ./blocks')
});

const STRUCTURE_PATTERNS = {
  hasImage: ['image', 'img', 'picture', 'photo'],
  hasHeading: ['title', 'heading', 'headline'],
  hasButton: ['button', 'btn', 'cta', 'action'],
  hasMultipleItems: ['item', 'card', 'column']
};

function buildBlockFilePath(blockName, fileName) {
  return `${blockName}/${fileName}`;
}

function detectStructureFeatures(classes) {
  const features = {};
  
  for (const [feature, patterns] of Object.entries(STRUCTURE_PATTERNS)) {
    features[feature] = classes.some(className => 
      patterns.some(pattern => className.includes(pattern))
    );
  }
  
  features.isBEM = classes.some(c => c.includes('__') || c.includes('--'));
  
  return features;
}

export async function analyzeBlock(source, blockName) {
  const result = {
    blockName,
    description: null,
    variants: [],
    hasJS: false,
    hasCSS: false,
    structure: {
      classes: [],
      hasImage: false,
      hasHeading: false,
      hasButton: false,
      hasMultipleItems: false,
      isBEM: false
    }
  };

  const jsContent = await source.getFileContent(buildBlockFilePath(blockName, `${blockName}.js`));
  if (jsContent) {
    result.hasJS = true;

    const jsdocMatch = jsContent.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/);
    if (jsdocMatch) {
      result.description = jsdocMatch[1];
    }

    const exportMatch = jsContent.match(/export\s+default\s+(?:async\s+)?function\s+(\w+)/);
    if (exportMatch) {
      result.structure.functionName = exportMatch[1];
    }
  }

  const cssContent = await source.getFileContent(buildBlockFilePath(blockName, `${blockName}.css`));
  if (cssContent) {
    result.hasCSS = true;

    const allClasses = new Set();
    const classMatches = cssContent.matchAll(/\.([a-zA-Z0-9_-]+)/g);
    for (const match of classMatches) {
      allClasses.add(match[1]);
    }
    result.structure.classes = Array.from(allClasses);

    const variantPattern = new RegExp(`\\.${blockName}\\.(\\w+)`, 'g');
    const variantMatches = cssContent.matchAll(variantPattern);
    const variants = new Set();
    for (const match of variantMatches) {
      if (match[1] !== blockName) {
        variants.add(match[1]);
      }
    }
    result.variants = Array.from(variants);

    Object.assign(result.structure, detectStructureFeatures(result.structure.classes));
  }

  return result;
}

export function generateAutoDescription(blockName, structure, variants) {
  const parts = [];
  
  if (structure.hasMultipleItems) {
    parts.push('Multi-item layout');
  }
  
  const content = [];
  if (structure.hasImage) content.push('images');
  if (structure.hasHeading) content.push('headings');
  if (structure.hasButton) content.push('buttons');
  
  if (content.length > 0) {
    parts.push(`with ${content.join(', ')}`);
  }
  
  if (variants?.length > 0) {
    parts.push(`Variants: ${variants.join(', ')}`);
  }
  
  return parts.length > 0 
    ? parts.join(' ') 
    : `${blockName.charAt(0).toUpperCase() + blockName.slice(1)} block`;
}

async function fetchSourceDocument(org, repo, sourcePath) {
  const url = formatURL('source', org, repo, sourcePath, 'html');
  let result = await daAdminRequest(url);
  
  if (typeof result === 'string' && result.startsWith('"') && result.endsWith('"')) {
    result = JSON.parse(result);
  }
  
  return result;
}

function parseBlockInstances(html, blockName) {
  const blockInstances = {};
  const openTagRegex = new RegExp(`<div([^>]*class="[^"]*\\b${blockName}\\b[^"]*"[^>]*)>`, 'gi');
  
  let match;
  while ((match = openTagRegex.exec(html)) !== null) {
    const openTag = match[0];
    const attributes = match[1];
    const startPos = match.index + openTag.length;
    
    const classMatch = attributes.match(/class="([^"]*)"/);
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];
    const variant = classes.find(cls => cls !== blockName && !cls.startsWith(blockName + '-')) || '';
    
    if (blockInstances[variant]) {
      continue;
    }
    
    let depth = 1;
    let pos = startPos;
    const divOpenRegex = /<div[^>]*>/g;
    const divCloseRegex = /<\/div>/g;
    
    while (depth > 0 && pos < html.length) {
      divOpenRegex.lastIndex = pos;
      divCloseRegex.lastIndex = pos;
      
      const nextOpen = divOpenRegex.exec(html);
      const nextClose = divCloseRegex.exec(html);
      
      if (!nextClose) break;
      
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        pos = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        if (depth === 0) {
          const content = html.substring(startPos, nextClose.index).trim();
          blockInstances[variant] = content;
          break;
        }
        pos = nextClose.index + nextClose[0].length;
      }
    }
  }
  
  return blockInstances;
}

export async function extractBlockContent(org, repo, sourcePaths, blockName) {
  if (!sourcePaths) {
    return { content: null, sourceUsed: null };
  }
  
  const paths = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  
  for (const sourcePath of paths) {
    try {
      const html = await fetchSourceDocument(org, repo, sourcePath);
      const content = parseBlockInstances(html, blockName);
      
      if (content && Object.keys(content).length > 0) {
        return { content, sourceUsed: sourcePath };
      }
    } catch {
      continue;
    }
  }
  
  return { content: null, sourceUsed: null };
}

export function generateBlockTemplate(blockName, description = null, variants = [], structure = {}, blockContent = null) {
  const capitalizedName = blockName.charAt(0).toUpperCase() + blockName.slice(1);
  const autoDescription = description || generateAutoDescription(blockName, structure, variants);
  
  const variantsToGenerate = variants?.length > 0 ? variants : [''];
  
  const blockSections = variantsToGenerate.map((variant) => {
    const variantName = variant ? `${capitalizedName} (${variant})` : capitalizedName;
    const classAttr = variant ? ` ${variant}` : '';
    
    const content = blockContent?.[variant] || blockContent?.[''] || '';
    
    return `    <div>
      <div class="library-metadata">
        <div>
          <div>name</div>
          <div>${variantName}</div>
        </div>
        <div>
          <div>description</div>
          <div>${autoDescription}</div>
        </div>
      </div>
      <div class="${blockName}${classAttr}">
${content}      </div>
    </div>`;
  }).join('\n');

  return `<body>
  <header></header>
  <main>
${blockSections}
  </main>
  <footer></footer>
</body>`;
}

async function createBlockDoc(org, repo, blockName, htmlContent, baseFolder = 'library') {
  const validation = validateBlockName(blockName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const docPath = buildLibraryPath(LIBRARY_TYPES.BLOCKS, baseFolder, blockName);
  const url = formatURL('source', org, repo, docPath, 'html');
  
  await uploadHTML(url, htmlContent);

  return {
    created: true,
    path: docPath,
    url: buildContentUrl(org, repo, docPath),
    error: null
  };
}

async function checkBlockDocExists(org, repo, blockName, baseFolder = 'library') {
  const validation = validateBlockName(blockName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const docPath = buildLibraryPath(LIBRARY_TYPES.BLOCKS, baseFolder, blockName);
  const url = formatURL('source', org, repo, docPath, 'html');

  try {
    await daAdminRequest(url);
    return {
      exists: true,
      path: docPath,
      url: buildContentUrl(org, repo, docPath)
    };
  } catch (error) {
    if (error.message?.includes('404')) {
      return {
        exists: false,
        path: docPath,
        url: buildContentUrl(org, repo, docPath)
      };
    }
    throw error;
  }
}

async function checkBlockFiles(source, blockName) {
  const [jsContent, cssContent] = await Promise.all([
    source.getFileContent(buildBlockFilePath(blockName, `${blockName}.js`)),
    source.getFileContent(buildBlockFilePath(blockName, `${blockName}.css`))
  ]);

  return {
    name: blockName,
    hasJS: !!jsContent,
    hasCSS: !!cssContent,
    type: 'dir'
  };
}

async function listBlocks(source) {
  const directories = await source.listDirectories();
  const blockPromises = directories.map(dir => checkBlockFiles(source, dir.name));
  return Promise.all(blockPromises);
}

async function tryGetReadme(source, blockName) {
  const readmeVariants = ['README.md', 'readme.md', 'README.MD'];
  
  for (const readme of readmeVariants) {
    const content = await source.getFileContent(buildBlockFilePath(blockName, readme));
    if (content) {
      return content;
    }
  }
  
  return null;
}

async function getBlockFiles(source, blockName) {
  const [jsContent, cssContent, readmeContent] = await Promise.all([
    source.getFileContent(buildBlockFilePath(blockName, `${blockName}.js`)),
    source.getFileContent(buildBlockFilePath(blockName, `${blockName}.css`)),
    tryGetReadme(source, blockName)
  ]);

  return {
    blockName,
    hasJS: !!jsContent,
    hasCSS: !!cssContent,
    hasReadme: !!readmeContent,
    jsContent,
    cssContent,
    readmeContent
  };
}

export const tools = [
  {
    name: 'da_blocks_list',
    description: 'List all blocks from source. AUTO-DETECTS local blocks if ./blocks exists. Returns block names and whether they have .js/.css files.',
    schema: ListBlocksSchema,
    handler: async (args) => {
      const { source, metadata } = await resolveBlockSource(args);
      const blocks = await listBlocks(source);
      return {
        source: metadata,
        totalBlocks: blocks.length,
        blocks
      };
    }
  },
  {
    name: 'da_blocks_get_files',
    description: 'Get block source files (.js, .css, README) from source. AUTO-DETECTS local blocks if ./blocks exists.',
    schema: GetBlockFilesSchema,
    handler: async (args) => {
      const { source, metadata } = await resolveBlockSource(args);
      const files = await getBlockFiles(source, args.blockName);
      return {
        source: metadata,
        ...files
      };
    }
  },
  {
    name: 'da_blocks_analyze',
    description: 'Analyze a block\'s code to extract metadata (description, variants, structure). AUTO-DETECTS local blocks if ./blocks exists.',
    schema: AnalyzeBlockSchema,
    handler: async (args) => {
      const { source, metadata } = await resolveBlockSource(args);
      const analysis = await analyzeBlock(source, args.blockName);
      return {
        source: metadata,
        ...analysis
      };
    }
  },
  {
    name: 'da_blocks_generate_template',
    description: 'Generate an HTML documentation template for a block with library metadata and description',
    schema: GenerateTemplateSchema,
    handler: async (args) => {
      const template = generateBlockTemplate(
        args.blockName, 
        args.description, 
        args.variants,
        args.structure || {}
      );
      return {
        blockName: args.blockName,
        template,
        usedStructure: !!args.structure
      };
    }
  },
  {
    name: 'da_blocks_create_doc',
    description: 'Create block documentation in DA at /{baseFolder}/blocks/{blockName}',
    schema: CreateDocSchema,
    handler: async (args) => {
      const result = await createBlockDoc(
        args.org,
        args.repo,
        args.blockName,
        args.htmlContent,
        args.baseFolder
      );
      return {
        org: args.org,
        repo: args.repo,
        blockName: args.blockName,
        baseFolder: args.baseFolder,
        ...result
      };
    }
  },
  {
    name: 'da_blocks_check_doc_exists',
    description: 'Check if block documentation exists in DA',
    schema: CheckDocExistsSchema,
    handler: async (args) => {
      const result = await checkBlockDocExists(
        args.org,
        args.repo,
        args.blockName,
        args.baseFolder
      );
      return {
        org: args.org,
        repo: args.repo,
        blockName: args.blockName,
        baseFolder: args.baseFolder,
        ...result
      };
    }
  }
];
