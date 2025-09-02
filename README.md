# fimgen

A JavaScript library for generating FIM (Fill-in-the-Middle) training datasets from git repositories.

This tool is mostly just me compiling all the random scripts scattered around my machine and attempting to unify the approaches in one place.

The idea is simple:

- analyze commit history
- extract meaningful code changes
- convert to FIM training examples
- filter out low-quality samples
- output as JSONL files ready for model training

## Features

- **Multiple FIM Formats**: Supports PSM, SPM, ZED, and MIXED formats
- **Dataset Types**: Generate KTO or DPO datasets for different training approaches
- **Quality Filtering**: Automatic filtering of generated code, merge conflicts, and low-quality samples
- **AST-Based Processing**: Intelligent cursor positioning using Abstract Syntax Trees
- **Language Support**: Python, JavaScript, TypeScript, Java, C/C++, Go, Rust, and more
- **Negative Example Generation**: Synthetic degradation methods for contrastive learning
- **Date Range Filtering**: Filter commits by date range for temporal dataset control

## Quick Start

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash
bun install

# Generate a dataset
bun start /path/to/your/repo --format ZED --dataset-type kto

# View the generated dataset
bun run viewer dataset/train_kto.jsonl
```

## Installation

```bash
bun install
```

## Usage

### Dataset Viewer

The package includes an interactive viewer for browsing generated datasets:

```bash
# View a specific file
bun run src/viewer.js dataset/train_kto.jsonl

# Or use bun script
bun run viewer dataset/train_kto.jsonl

# Browse all datasets in a directory
bun run src/viewer.js -d dataset/

# Interactive commands:
# n/next - Next example
# p/prev - Previous example
# g/goto 5 - Jump to example 5
# s/search function - Search for "function"
# f/filter language python - Show only Python examples
# stats - Show dataset statistics
# q/quit - Exit
```

### Command Line

```bash
# Generate KTO dataset with Zed format
bun run src/index.js /path/to/repo --format ZED --dataset-type kto

# Generate DPO dataset for Python files only
bun run src/index.js /path/to/repo --dataset-type dpo --extensions .py

# Generate both datasets with custom settings
bun run src/index.js /path/to/repo --dataset-type both --max-commits 500

# Filter commits by date range
bun run src/index.js /path/to/repo --start-date 2024-01-01 --end-date 2024-06-30

# Or use the start script
bun start /path/to/repo --format ZED --dataset-type kto
```

### Options

- `-r, --repo <path>` - Path to git repository
- `-o, --output <dir>` - Output directory (default: ./dataset)
- `--max-commits <n>` - Maximum commits to process (default: 1000)
- `--format <type>` - FIM format: PSM, SPM, ZED, MIXED (default: ZED)
- `--dataset-type <type>` - Dataset type: kto, dpo, both (default: kto)
- `--split <ratio>` - Train/test split ratio (default: 0.9)
- `--extensions <ext>...` - File extensions to process
- `--start-date <date>` - Filter commits from this date (YYYY-MM-DD format)
- `--end-date <date>` - Filter commits until this date (YYYY-MM-DD format)
- `-h, --help` - Show help

### Programmatic API

```javascript
import { DatasetBuilder } from './src/dataset-builder.js';
import { FIMFormat } from './src/types.js';

const builder = new DatasetBuilder('/path/to/repo', './output');

// Generate KTO dataset
const stats = await builder.buildKTODataset({
  maxCommits: 1000,
  fimFormat: FIMFormat.ZED,
  trainTestSplit: 0.9,
  fileExtensions: ['.js', '.py'],
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
});

console.log(stats);
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
bun test

# Run specific test files
bun test test/quality-filter.test.js

# Run with watch mode for development
bun test --watch

# Alternative: still works with Node.js
npm test
```

## Output Format

The tool generates JSONL files with the following structure:

### KTO Format
```json
{
  "prompt": "<|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>",
  "completion": "code to complete",
  "label": true,
  "metadata": {
    "filepath": "src/example.js",
    "language": "javascript",
    "commit": "abc123"
  }
}
```

### DPO Format
```json
{
  "prompt": "<|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>",
  "chosen": "correct completion",
  "rejected": "incorrect completion",
  "metadata": {...}
}
```

## Requirements

- Bun 1.2.x or higher (or Node.js 18.0.0+ as fallback)
- Git repository with commit history
- Sufficient disk space for output datasets (theyre usually not that big)

## License

MIT

## TODO

- [ ] Add more languages and file types
- [ ] Eval AST-based cursor positioning, not sure this actually works well as written
- [ ] Enhance quality filtering heuristics via embeddings or LLM-as-a-judge
- [ ] Optimize performance for large repositories, its not super fast right now
- [ ] Implement more synthetic degradation methods for negative examples, this likely will be LLM driven
- [ ] Add configuration file support for default options
- [ ] Improve documentation and examples
- [ ] Improve use as a library with better API design
- [ ] Add CI/CD for tests and linting
- [ ] Improve dataset viewer, maybe a web UI? (god I hope not)
