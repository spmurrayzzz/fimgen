#!/usr/bin/env node

import { DatasetBuilder } from './dataset-builder.js';
import { FIMFormat } from './types.js';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const options = {
  'repo': {
    type: 'string',
    short: 'r',
    description: 'Path to git repository'
  },
  'output': {
    type: 'string',
    short: 'o',
    default: './dataset',
    description: 'Output directory for datasets'
  },
  'max-commits': {
    type: 'string',
    default: '1000',
    description: 'Maximum commits to process'
  },
  'format': {
    type: 'string',
    default: 'ZED',
    description: 'FIM format (PSM, SPM, ZED, MIXED)'
  },
  'dataset-type': {
    type: 'string',
    default: 'kto',
    description: 'Dataset type (kto, dpo, both)'
  },
  'split': {
    type: 'string',
    default: '0.9',
    description: 'Train/test split ratio'
  },
  'extensions': {
    type: 'string',
    multiple: true,
    description: 'File extensions to process'
  },
  'start-date': {
    type: 'string',
    description: 'Start date for commit range (ISO format: YYYY-MM-DD)'
  },
  'end-date': {
    type: 'string',
    description: 'End date for commit range (ISO format: YYYY-MM-DD)'
  },
  'help': {
    type: 'boolean',
    short: 'h',
    description: 'Show help'
  }
};

function parseDateRange(startDateStr, endDateStr) {
  let startDate = null;
  let endDate = null;

  if (startDateStr) {
    startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      console.error('Error: Invalid start-date format. Use YYYY-MM-DD');
      process.exit(1);
    }
  }

  if (endDateStr) {
    endDate = new Date(endDateStr);
    if (isNaN(endDate.getTime())) {
      console.error('Error: Invalid end-date format. Use YYYY-MM-DD');
      process.exit(1);
    }
  }

  if (startDate && endDate && startDate > endDate) {
    console.error('Error: start-date must be before end-date');
    process.exit(1);
  }

  return { startDate, endDate };
}

function showHelp() {
  console.log(`
FIM Dataset Generator - Generate training datasets from git repositories

Usage:
  fim-dataset-generator <repo-path> [options]

Options:
  -r, --repo <path>           Path to git repository
  -o, --output <dir>          Output directory (default: ./dataset)
  --max-commits <n>           Maximum commits to process (default: 1000)
  --format <type>             FIM format: PSM, SPM, ZED, MIXED (default: ZED)
  --dataset-type <type>       Dataset type: kto, dpo, both (default: kto)
  --split <ratio>             Train/test split ratio (default: 0.9)
  --extensions <ext>...       File extensions to process
  --start-date <date>         Start date for commits (YYYY-MM-DD)
  --end-date <date>           End date for commits (YYYY-MM-DD)
  -h, --help                  Show this help

Examples:
  # Generate KTO dataset with Zed format
  fim-dataset-generator /path/to/repo --format ZED --dataset-type kto

  # Generate DPO dataset for Python files only
  fim-dataset-generator /path/to/repo --dataset-type dpo --extensions .py

  # Generate both datasets with custom settings
  fim-dataset-generator /path/to/repo --dataset-type both --max-commits 500

  # Generate dataset for specific date range
  fim-dataset-generator /path/to/repo --start-date 2024-01-01 --end-date 2024-06-30
`);
}

async function main() {
  const { values, positionals } = parseArgs({ 
    options, 
    allowPositionals: true,
    strict: false 
  });

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const repoPath = values.repo || positionals[0];
  if (!repoPath) {
    console.error('Error: Repository path is required');
    showHelp();
    process.exit(1);
  }

  const resolvedPath = resolve(repoPath);
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Repository path does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  const maxCommits = parseInt(values['max-commits'], 10);
  const split = parseFloat(values.split);

  if (isNaN(maxCommits) || maxCommits <= 0) {
    console.error('Error: max-commits must be a positive number');
    process.exit(1);
  }

  if (isNaN(split) || split <= 0 || split >= 1) {
    console.error('Error: split must be between 0 and 1');
    process.exit(1);
  }

  const format = FIMFormat[values.format.toUpperCase()];
  if (!format) {
    console.error(`Error: Invalid format ${values.format}`);
    console.error('Valid formats: PSM, SPM, ZED, MIXED');
    process.exit(1);
  }

  const datasetType = values['dataset-type'].toLowerCase();
  if (!['kto', 'dpo', 'both'].includes(datasetType)) {
    console.error('Error: dataset-type must be kto, dpo, or both');
    process.exit(1);
  }

  const { startDate, endDate } = parseDateRange(values['start-date'], values['end-date']);

  console.log(`Starting dataset generation from ${resolvedPath}`);
  console.log(`Output directory: ${values.output}`);
  console.log(`Format: ${values.format}`);
  console.log('-'.repeat(50));

  try {
    const builder = new DatasetBuilder(resolvedPath, values.output);

    if (datasetType === 'kto' || datasetType === 'both') {
      console.log('\nGenerating KTO dataset...');
      const stats = await builder.buildKTODataset({
        maxCommits,
        fimFormat: format,
        trainTestSplit: split,
        fileExtensions: values.extensions,
        startDate,
        endDate
      });

      if (!stats.error) {
        console.log('\nKTO Dataset Statistics:');
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.error(`KTO generation failed: ${stats.error}`);
      }
    }

    if (datasetType === 'dpo' || datasetType === 'both') {
      console.log('\nGenerating DPO dataset...');
      const stats = await builder.buildDPODataset({
        maxCommits,
        fimFormat: format,
        trainTestSplit: split,
        fileExtensions: values.extensions,
        startDate,
        endDate
      });

      if (!stats.error) {
        console.log('\nDPO Dataset Statistics:');
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.error(`DPO generation failed: ${stats.error}`);
      }
    }

    console.log(`\n✓ Datasets saved to ${values.output}`);
    console.log(`  - Check ${values.output}/dataset_generation.log for detailed logs`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});