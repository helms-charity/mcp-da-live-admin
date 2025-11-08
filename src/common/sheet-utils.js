// src/common/sheet-utils.js

import { daAdminRequest, formatURL, uploadJSON } from './utils.js';
import { getDataSheet, addEntry, removeEntry, entryExists } from './library-cfg-utils.js';

export async function uploadSheetJSON(org, repo, path, sheetJSON) {
  const url = formatURL('source', org, repo, path, 'json');
  await uploadJSON(url, sheetJSON);
}

export async function getSheetJSON(org, repo, path) {
  try {
    const url = formatURL('source', org, repo, path, 'json');
    return await daAdminRequest(url);
  } catch (error) {
    if (error.message?.includes('404')) {
      return null;
    }
    throw error;
  }
}

export async function listSheetItems(org, repo, path) {
  const sheetJSON = await getSheetJSON(org, repo, path);
  
  if (!sheetJSON) return [];

  const dataSheet = getDataSheet(sheetJSON);
  return dataSheet?.data || [];
}

export async function addSheetItem(org, repo, entry, keyField, path, createSheetFn) {
  const sheetJSON = await getSheetJSON(org, repo, path);
  const dataSheet = sheetJSON ? getDataSheet(sheetJSON) : null;

  const created = !sheetJSON; // Track if we're creating the file for the first time
  const existed = dataSheet ? entryExists(dataSheet, entry[keyField], keyField) : false;
  const updatedDataSheet = addEntry(dataSheet, entry, keyField);

  const newSheetJSON = createSheetFn(updatedDataSheet.data);
  await uploadSheetJSON(org, repo, path, newSheetJSON);

  return {
    added: true,
    created,
    existed,
    path,
    entry
  };
}

export async function removeSheetItem(org, repo, key, keyField, path, createSheetFn) {
  const sheetJSON = await getSheetJSON(org, repo, path);

  if (!sheetJSON) {
    return {
      removed: false,
      error: 'Sheet not found'
    };
  }

  const dataSheet = getDataSheet(sheetJSON);

  if (!dataSheet) {
    return {
      removed: false,
      error: 'Data sheet not found'
    };
  }

  const updatedDataSheet = removeEntry(dataSheet, key, keyField);
  const newSheetJSON = createSheetFn(updatedDataSheet.data);
  await uploadSheetJSON(org, repo, path, newSheetJSON);

  return {
    removed: true,
    path
  };
}

export async function setupSheetItems(org, repo, items, keyField, path, createSheetFn, createEntry) {
  const result = {
    summary: {
      total: items.length,
      added: 0,
      updated: 0,
      failed: 0
    },
    items: [],
    errors: []
  };

  for (const item of items) {
    try {
      const entry = createEntry(item);
      const addResult = await addSheetItem(
        org,
        repo,
        entry,
        keyField,
        path,
        createSheetFn
      );

      result.items.push({
        ...item,
        success: true,
        existed: addResult.existed
      });

      if (addResult.existed) {
        result.summary.updated++;
      } else {
        result.summary.added++;
      }
    } catch (error) {
      result.items.push({
        ...item,
        success: false,
        error: error.message
      });
      result.summary.failed++;
      result.errors.push(`${item[keyField] || item.key || item.name}: ${error.message}`);
    }
  }

  result.success = result.summary.failed === 0;
  return result;
}
