# FIMGen Codebase Guide for AI Agents

## Build & Test Commands
```bash
bun test                     # Run all tests
bun test test/[file].test.js # Run single test file
npm run lint                 # Run ESLint
npm run lint:fix            # Auto-fix linting issues
```

## Code Style & Conventions
- **Module System**: ES6 modules (`import`/`export`), use `.js` extensions in imports
- **Node Version**: >=18.0.0, Bun >=1.0.0 as primary runtime
- **Imports**: Use Node.js built-ins with `node:` prefix (e.g., `import { test } from 'node:test'`)
- **Classes**: PascalCase, exported as named exports (e.g., `export class DatasetBuilder`)
- **Constants**: UPPER_SNAKE_CASE for class constants (e.g., `this.MIN_CODE_LENGTH`)
- **Testing**: Node.js test runner with `describe`/`test` blocks, use `./test-helper.js` for assertions
- **Logging**: Winston logger, silent in test mode (`NODE_ENV=test`)
- **Error Handling**: Try-catch blocks around file operations, return boolean/null on failures
- **File Structure**: Single class per file, matching filename (e.g., `dataset-builder.js` → `DatasetBuilder`)
- **Types**: Use JSDoc-style documentation, custom type classes in `types.js`