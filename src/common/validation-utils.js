// src/common/validation-utils.js

import { ADMIN_API_URL } from './global.js';

const INVALID_CHARS = /[<>:"|?*\\]/;
const INVALID_PATH_CHARS = /[<>:"|?*]/;
const PATH_TRAVERSAL = '..';
const INVALID_BRANCH_CHARS = /[\s~^:?*\[\\]/;

function validationResult(valid, error = null) {
  return { valid, error };
}

function validateString(value, fieldName) {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return validationResult(false, `${fieldName} must be a non-empty string`);
  }
  return null;
}

export function validateOrgRepo(org, repo) {
  const orgCheck = validateString(org, 'Organization name');
  if (orgCheck) return orgCheck;

  const repoCheck = validateString(repo, 'Repository name');
  if (repoCheck) return repoCheck;

  if (INVALID_CHARS.test(org)) {
    return validationResult(false, 'Organization name contains invalid characters');
  }

  if (INVALID_CHARS.test(repo)) {
    return validationResult(false, 'Repository name contains invalid characters');
  }

  return validationResult(true);
}

export function validateBaseFolder(baseFolder) {
  const stringCheck = validateString(baseFolder, 'Base folder');
  if (stringCheck) return stringCheck;

  const clean = baseFolder.replace(/^\/+|\/+$/g, '');

  if (clean.length === 0) {
    return validationResult(false, 'Base folder cannot be empty');
  }

  if (INVALID_PATH_CHARS.test(clean)) {
    return validationResult(false, 'Base folder contains invalid characters');
  }

  if (clean.includes(PATH_TRAVERSAL)) {
    return validationResult(false, 'Base folder cannot contain path traversal (..)');
  }

  return validationResult(true);
}

export function validateBlockName(blockName) {
  const stringCheck = validateString(blockName, 'Block name');
  if (stringCheck) return stringCheck;

  const trimmed = blockName.trim();

  if (/[\/\\]/.test(trimmed)) {
    return validationResult(false, 'Block name cannot contain slashes');
  }

  if (trimmed.includes(PATH_TRAVERSAL)) {
    return validationResult(false, 'Block name cannot contain path traversal (..)');
  }

  if (INVALID_PATH_CHARS.test(trimmed)) {
    return validationResult(false, 'Block name contains invalid characters');
  }

  return validationResult(true);
}

export function validateBranch(branch) {
  const stringCheck = validateString(branch, 'Branch name');
  if (stringCheck) return stringCheck;

  const trimmed = branch.trim();

  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return validationResult(false, 'Branch name cannot start or end with a dot');
  }

  if (trimmed.includes(PATH_TRAVERSAL)) {
    return validationResult(false, 'Branch name cannot contain consecutive dots');
  }

  if (INVALID_BRANCH_CHARS.test(trimmed)) {
    return validationResult(false, 'Branch name contains invalid characters');
  }

  return validationResult(true);
}

export async function validateGitHubAccess(octokit, org, repo, branch = 'main') {
  try {
    await octokit.repos.get({ owner: org, repo });

    try {
      await octokit.repos.getBranch({ owner: org, repo, branch });
    } catch (branchError) {
      return {
        accessible: false,
        error: `Branch '${branch}' not found in ${org}/${repo}. ${branchError.message}`
      };
    }

    return { accessible: true, error: null };
  } catch (error) {
    if (error.status === 404) {
      return {
        accessible: false,
        error: `Repository ${org}/${repo} not found or not accessible`
      };
    }

    if (error.status === 401) {
      return {
        accessible: false,
        error: 'GitHub authentication failed. Check GITHUB_TOKEN environment variable'
      };
    }

    if (error.status === 403) {
      return {
        accessible: false,
        error: 'GitHub API rate limit exceeded or access forbidden'
      };
    }

    return {
      accessible: false,
      error: `GitHub API error: ${error.message}`
    };
  }
}

export async function validateDAAccess(org, repo) {
  try {
    const url = `${ADMIN_API_URL}/list/${org}/${repo}/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DA_ADMIN_API_TOKEN}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          accessible: false,
          error: 'DA Admin API authentication failed. Check DA_ADMIN_API_TOKEN environment variable'
        };
      }

      if (response.status === 404) {
        return {
          accessible: false,
          error: `Repository ${org}/${repo} not found in DA`
        };
      }

      return {
        accessible: false,
        error: `DA Admin API error: ${response.status} ${response.statusText}`
      };
    }

    return { accessible: true, error: null };
  } catch (error) {
    return {
      accessible: false,
      error: `DA Admin API connection error: ${error.message}`
    };
  }
}

export async function validateDADestination(org, repo, baseFolder) {
  const orgRepoValidation = validateOrgRepo(org, repo);
  if (!orgRepoValidation.valid) {
    return orgRepoValidation;
  }

  const baseFolderValidation = validateBaseFolder(baseFolder);
  if (!baseFolderValidation.valid) {
    return baseFolderValidation;
  }

  const daAccess = await validateDAAccess(org, repo);
  if (!daAccess.accessible) {
    return validationResult(false, daAccess.error);
  }

  return validationResult(true);
}

export async function validatePrerequisites(octokit, org, repo, baseFolder, blockName = null, branch = 'main') {
  const errors = [];

  const validations = [
    validateOrgRepo(org, repo),
    validateBaseFolder(baseFolder),
    validateBranch(branch)
  ];

  if (blockName) {
    validations.push(validateBlockName(blockName));
  }

  for (const validation of validations) {
    if (!validation.valid) {
      errors.push(validation.error);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const [githubAccess, daAccess] = await Promise.all([
    validateGitHubAccess(octokit, org, repo, branch),
    validateDAAccess(org, repo)
  ]);

  if (!githubAccess.accessible) {
    errors.push(githubAccess.error);
  }

  if (!daAccess.accessible) {
    errors.push(daAccess.error);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
