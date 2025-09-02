#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parseArgs } from 'node:util';
import readline from 'node:readline';

class DatasetViewer {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    this.examples = [];
    this.currentIndex = 0;
    this.loadDataset();
  }

  loadDataset() {
    if (!existsSync(this.filePath)) {
      throw new Error(`File not found: ${this.filePath}`);
    }

    const content = readFileSync(this.filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    this.examples = lines.map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.warn(`Failed to parse line ${idx + 1}: ${e.message}`);
        return null;
      }
    }).filter(Boolean);

    console.log(`Loaded ${this.examples.length} examples from ${basename(this.filePath)}`);
  }

  displayExample(index) {
    if (index < 0 || index >= this.examples.length) {
      console.log('No example at this index');
      return;
    }

    const example = this.examples[index];
    console.clear();
    console.log('='.repeat(80));
    console.log(`Example ${index + 1} of ${this.examples.length}`);
    console.log('='.repeat(80));

    // Display based on example type
    if ('label' in example) {
      this.displayKTOExample(example);
    } else if ('chosen' in example && 'rejected' in example) {
      this.displayDPOExample(example);
    } else {
      this.displayGenericExample(example);
    }

    console.log('\n' + '-'.repeat(80));
    console.log('Commands: [n]ext, [p]revious, [g]oto, [s]earch, [f]ilter, [q]uit');
  }

  displayKTOExample(example) {
    console.log('\n📊 KTO Example');
    console.log(`Label: ${example.label ? '✅ Positive' : '❌ Negative'}`);
    
    if (example.metadata) {
      this.displayMetadata(example.metadata);
    }

    console.log('\n📝 Prompt:');
    console.log(this.formatCode(example.prompt));
    
    console.log('\n✨ Completion:');
    console.log(this.formatCode(example.completion));
  }

  displayDPOExample(example) {
    console.log('\n🎯 DPO Example');
    
    if (example.metadata) {
      this.displayMetadata(example.metadata);
    }

    console.log('\n📝 Prompt:');
    console.log(this.formatCode(example.prompt));
    
    console.log('\n✅ Chosen:');
    console.log(this.formatCode(example.chosen));
    
    console.log('\n❌ Rejected:');
    console.log(this.formatCode(example.rejected));
  }

  displayGenericExample(example) {
    console.log('\n📄 Generic Example');
    
    if (example.metadata) {
      this.displayMetadata(example.metadata);
    }

    for (const [key, value] of Object.entries(example)) {
      if (key === 'metadata') continue;
      console.log(`\n${key}:`);
      if (typeof value === 'string') {
        console.log(this.formatCode(value));
      } else {
        console.log(JSON.stringify(value, null, 2));
      }
    }
  }

  displayMetadata(metadata) {
    console.log('\n📋 Metadata:');
    if (metadata.filepath) console.log(`  File: ${metadata.filepath}`);
    if (metadata.language) console.log(`  Language: ${metadata.language}`);
    if (metadata.commit) console.log(`  Commit: ${metadata.commit}`);
    if (metadata.commitMessage) console.log(`  Message: ${metadata.commitMessage}`);
    if (metadata.degradationMethod) console.log(`  Degradation: ${metadata.degradationMethod}`);
  }

  formatCode(text) {
    if (!text) return '(empty)';
    
    // Handle FIM markers specially
    const formatted = text
      .replace(/<\|fim_prefix\|>/g, '\n--- PREFIX ---\n')
      .replace(/<\|fim_suffix\|>/g, '\n--- SUFFIX ---\n')
      .replace(/<\|fim_middle\|>/g, '\n--- MIDDLE ---\n')
      .replace(/<\|editable_region_start\|>/g, '\n[EDITABLE START]\n')
      .replace(/<\|editable_region_end\|>/g, '\n[EDITABLE END]\n')
      .replace(/<\|user_cursor_is_here\|>/g, '│CURSOR│');

    // Truncate very long text
    if (formatted.length > 2000) {
      return formatted.substring(0, 2000) + '\n... (truncated)';
    }
    
    return formatted;
  }

  async search(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    this.examples.forEach((example, idx) => {
      const text = JSON.stringify(example).toLowerCase();
      if (text.includes(lowerQuery)) {
        results.push(idx);
      }
    });

    if (results.length === 0) {
      console.log('No matches found');
    } else {
      console.log(`Found ${results.length} matches: ${results.slice(0, 10).join(', ')}${results.length > 10 ? '...' : ''}`);
      if (results.length > 0) {
        this.currentIndex = results[0];
        this.displayExample(this.currentIndex);
      }
    }
  }

  filter(key, value) {
    const filtered = [];
    
    this.examples.forEach((example, idx) => {
      if (key === 'label' && example.label === (value === 'true')) {
        filtered.push(idx);
      } else if (key === 'language' && example.metadata?.language === value) {
        filtered.push(idx);
      } else if (key === 'file' && example.metadata?.filepath?.includes(value)) {
        filtered.push(idx);
      }
    });

    if (filtered.length === 0) {
      console.log('No matches found');
    } else {
      console.log(`Found ${filtered.length} matches`);
      if (filtered.length > 0) {
        this.currentIndex = filtered[0];
        this.displayExample(this.currentIndex);
      }
    }
  }

  showStats() {
    const stats = {
      total: this.examples.length,
      positive: 0,
      negative: 0,
      languages: new Set(),
      files: new Set(),
      degradationMethods: new Set()
    };

    this.examples.forEach(ex => {
      if ('label' in ex) {
        if (ex.label) stats.positive++;
        else stats.negative++;
      }
      if (ex.metadata?.language) stats.languages.add(ex.metadata.language);
      if (ex.metadata?.filepath) stats.files.add(ex.metadata.filepath);
      if (ex.metadata?.degradationMethod) stats.degradationMethods.add(ex.metadata.degradationMethod);
    });

    console.log('\n📈 Dataset Statistics:');
    console.log(`Total examples: ${stats.total}`);
    if (stats.positive > 0 || stats.negative > 0) {
      console.log(`Positive: ${stats.positive} (${(stats.positive/stats.total*100).toFixed(1)}%)`);
      console.log(`Negative: ${stats.negative} (${(stats.negative/stats.total*100).toFixed(1)}%)`);
    }
    console.log(`Languages: ${[...stats.languages].join(', ')}`);
    console.log(`Unique files: ${stats.files.size}`);
    if (stats.degradationMethods.size > 0) {
      console.log(`Degradation methods: ${[...stats.degradationMethods].join(', ')}`);
    }
  }

  async interactive() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (question) => new Promise(resolve => rl.question(question, resolve));

    this.displayExample(this.currentIndex);

    while (true) {
      const command = await ask('\n> ');
      const parts = command.trim().split(' ');
      const cmd = parts[0].toLowerCase();

      switch (cmd) {
        case 'n':
        case 'next':
          if (this.currentIndex < this.examples.length - 1) {
            this.currentIndex++;
            this.displayExample(this.currentIndex);
          } else {
            console.log('Already at last example');
          }
          break;

        case 'p':
        case 'prev':
        case 'previous':
          if (this.currentIndex > 0) {
            this.currentIndex--;
            this.displayExample(this.currentIndex);
          } else {
            console.log('Already at first example');
          }
          break;

        case 'g':
        case 'goto':
          const index = parseInt(parts[1]) - 1;
          if (!isNaN(index) && index >= 0 && index < this.examples.length) {
            this.currentIndex = index;
            this.displayExample(this.currentIndex);
          } else {
            console.log('Invalid index');
          }
          break;

        case 's':
        case 'search':
          if (parts.length > 1) {
            await this.search(parts.slice(1).join(' '));
          } else {
            console.log('Usage: search <query>');
          }
          break;

        case 'f':
        case 'filter':
          if (parts.length > 2) {
            this.filter(parts[1], parts.slice(2).join(' '));
          } else {
            console.log('Usage: filter <key> <value>');
            console.log('Keys: label, language, file');
          }
          break;

        case 'stats':
          this.showStats();
          break;

        case 'q':
        case 'quit':
        case 'exit':
          rl.close();
          return;

        case 'h':
        case 'help':
          console.log('\nCommands:');
          console.log('  n/next         - Next example');
          console.log('  p/previous     - Previous example');
          console.log('  g/goto <n>     - Go to example n');
          console.log('  s/search <q>   - Search for query');
          console.log('  f/filter <k> <v> - Filter by key=value');
          console.log('  stats          - Show dataset statistics');
          console.log('  q/quit         - Exit viewer');
          console.log('  h/help         - Show this help');
          break;

        default:
          if (command.trim()) {
            console.log('Unknown command. Type "help" for commands.');
          }
      }
    }
  }
}

function listDatasets(dir) {
  const datasets = readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .sort();
  
  if (datasets.length === 0) {
    console.log('No .jsonl files found in directory');
    return null;
  }

  console.log('\nAvailable datasets:');
  datasets.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });
  
  return datasets;
}

async function main() {
  const options = {
    'file': {
      type: 'string',
      short: 'f',
      description: 'Path to JSONL file'
    },
    'dir': {
      type: 'string',
      short: 'd',
      default: './dataset',
      description: 'Directory containing datasets'
    },
    'help': {
      type: 'boolean',
      short: 'h',
      description: 'Show help'
    }
  };

  const { values, positionals } = parseArgs({ 
    options, 
    allowPositionals: true,
    strict: false 
  });

  if (values.help) {
    console.log(`
Dataset Viewer - Interactive JSONL dataset browser

Usage:
  viewer [file.jsonl]           View specific file
  viewer -d <dir>               List and select from directory
  viewer -f <file>              View specific file

Options:
  -f, --file <path>     Path to JSONL file
  -d, --dir <path>      Directory with datasets (default: ./dataset)
  -h, --help            Show this help

Interactive Commands:
  n/next         Next example
  p/previous     Previous example  
  g/goto <n>     Go to example n
  s/search <q>   Search for query
  f/filter <k> <v>  Filter by key=value
  stats          Show statistics
  q/quit         Exit viewer
`);
    process.exit(0);
  }

  let filePath = values.file || positionals[0];

  if (!filePath) {
    const dir = resolve(values.dir);
    if (!existsSync(dir)) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }

    const datasets = listDatasets(dir);
    if (!datasets) {
      process.exit(1);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('\nSelect dataset (number or name): ', resolve);
    });
    rl.close();

    const selection = parseInt(answer);
    if (!isNaN(selection) && selection > 0 && selection <= datasets.length) {
      filePath = resolve(dir, datasets[selection - 1]);
    } else if (datasets.includes(answer)) {
      filePath = resolve(dir, answer);
    } else {
      console.error('Invalid selection');
      process.exit(1);
    }
  }

  try {
    const viewer = new DatasetViewer(filePath);
    await viewer.interactive();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});