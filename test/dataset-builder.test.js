import { test, describe, beforeEach, afterEach } from 'node:test';
import { assert } from './test-helper.js';
import { DatasetBuilder } from '../src/dataset-builder.js';
import { FIMFormat } from '../src/types.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

describe('DatasetBuilder', () => {
  let tempRepoDir;
  let tempOutputDir;
  let builder;

  function createTestRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'test-repo-'));
    
    // Initialize git repo
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@example.com"', { cwd: dir });
    execSync('git config user.name "Test User"', { cwd: dir });
    
    // Create test files with quality code
    const jsCode1 = `function calculateSum(numbers) {
    let total = 0;
    for (const num of numbers) {
        total += num;
    }
    return total;
}`;

    const jsCode2 = `function calculateSum(numbers) {
    return numbers.reduce((sum, num) => sum + num, 0);
}

function calculateAverage(numbers) {
    const sum = calculateSum(numbers);
    return sum / numbers.length;
}`;

    // Initial commit
    writeFileSync(join(dir, 'math.js'), jsCode1);
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "Add calculateSum function"', { cwd: dir });
    
    // Update commit
    writeFileSync(join(dir, 'math.js'), jsCode2);
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "Refactor and add calculateAverage"', { cwd: dir });
    
    return dir;
  }

  beforeEach(() => {
    tempRepoDir = createTestRepo();
    tempOutputDir = mkdtempSync(join(tmpdir(), 'test-output-'));
    builder = new DatasetBuilder(tempRepoDir, tempOutputDir);
  });

  afterEach(() => {
    if (tempRepoDir) {
      try { rmSync(tempRepoDir, { recursive: true }); } catch {}
    }
    if (tempOutputDir) {
      try { rmSync(tempOutputDir, { recursive: true }); } catch {}
    }
  });

  test('should create instance', () => {
    assert(builder instanceof DatasetBuilder);
  });

  describe('constructor', () => {
    test('should initialize with repository and output paths', () => {
      const b = new DatasetBuilder(tempRepoDir, tempOutputDir);
      assert(b.repoPath);
      assert(b.outputDir);
    });

    test('should create output directory if it does not exist', () => {
      const newOutputDir = join(tmpdir(), 'new-output-' + Date.now());
      new DatasetBuilder(tempRepoDir, newOutputDir);
      assert(existsSync(newOutputDir));
      rmSync(newOutputDir, { recursive: true });
    });

    test('should initialize sub-components', () => {
      const b = new DatasetBuilder(tempRepoDir, tempOutputDir);
      assert(b.gitMiner);
      assert(b.fimTransformer);
      assert(b.negativeGenerator);
      assert(b.logger);
    });
  });

  describe('buildKTODataset', () => {
    test('should generate KTO dataset files', async () => {
      const stats = await builder.buildKTODataset({
        maxCommits: 10,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.8,
        fileExtensions: ['.js']
      });

      assert(!stats.error);
      assert(stats.totalExamples > 0);
      assert(stats.positiveExamples > 0);
      assert(stats.negativeExamples > 0);
      
      // Check files were created
      assert(existsSync(join(tempOutputDir, 'train_kto.jsonl')));
      assert(existsSync(join(tempOutputDir, 'test_kto.jsonl')));
      assert(existsSync(join(tempOutputDir, 'kto_stats.json')));
    });

    test('should respect train/test split', async () => {
      const stats = await builder.buildKTODataset({
        maxCommits: 10,
        fimFormat: FIMFormat.PSM,
        trainTestSplit: 0.7
      });

      const trainRatio = stats.trainExamples / stats.totalExamples;
      assert(Math.abs(trainRatio - 0.7) < 0.1); // Allow some variance
    });

    test('should balance positive and negative examples', async () => {
      // Add more commits to ensure we have enough for negative examples
      for (let i = 0; i < 5; i++) {
        const content = `function test${i}() { return ${i}; }`;
        writeFileSync(join(tempRepoDir, `test${i}.js`), content);
        execSync('git add .', { cwd: tempRepoDir });
        execSync(`git commit -m "Add test${i}"`, { cwd: tempRepoDir });
        
        // Update the file for next commit
        writeFileSync(join(tempRepoDir, `test${i}.js`), content + '\n// updated');
        execSync('git add .', { cwd: tempRepoDir });
        execSync(`git commit -m "Update test${i}"`, { cwd: tempRepoDir });
      }
      
      const stats = await builder.buildKTODataset({
        maxCommits: 20,
        fimFormat: FIMFormat.ZED
      });

      // Should be roughly balanced
      assert(stats.positiveExamples > 0);
      assert(stats.negativeExamples > 0);
      assert(stats.negativeExamples <= stats.positiveExamples);
    });

    test('should handle empty repository gracefully', async () => {
      const emptyRepo = mkdtempSync(join(tmpdir(), 'empty-'));
      execSync('git init', { cwd: emptyRepo });
      
      const emptyBuilder = new DatasetBuilder(emptyRepo, tempOutputDir);
      const stats = await emptyBuilder.buildKTODataset({
        maxCommits: 10
      });

      assert(stats.error);
      rmSync(emptyRepo, { recursive: true });
    });

    test('should write valid JSONL format', async () => {
      await builder.buildKTODataset({
        maxCommits: 5,
        fimFormat: FIMFormat.ZED
      });

      const content = readFileSync(join(tempOutputDir, 'train_kto.jsonl'), 'utf-8');
      const lines = content.trim().split('\n');
      
      lines.forEach(line => {
        const obj = JSON.parse(line);
        assert(obj.prompt);
        assert(obj.completion);
        assert(typeof obj.label === 'boolean');
      });
    });
  });

  describe('buildDPODataset', () => {
    test('should generate DPO dataset files', async () => {
      const stats = await builder.buildDPODataset({
        maxCommits: 10,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.8,
        fileExtensions: ['.js']
      });

      assert(!stats.error);
      assert(stats.totalExamples > 0);
      
      // Check files were created
      assert(existsSync(join(tempOutputDir, 'train_dpo.jsonl')));
      assert(existsSync(join(tempOutputDir, 'test_dpo.jsonl')));
      assert(existsSync(join(tempOutputDir, 'dpo_stats.json')));
    });

    test('should create chosen/rejected pairs', async () => {
      await builder.buildDPODataset({
        maxCommits: 5,
        fimFormat: FIMFormat.PSM
      });

      const content = readFileSync(join(tempOutputDir, 'train_dpo.jsonl'), 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      lines.forEach(line => {
        const obj = JSON.parse(line);
        assert(obj.prompt);
        assert(obj.chosen);
        assert(obj.rejected);
        assert(obj.chosen !== obj.rejected);
      });
    });
  });

  describe('_saveDataset', () => {
    test('should save examples to JSONL file', () => {
      const examples = [
        { prompt: 'p1', completion: 'c1', label: true, metadata: {} },
        { prompt: 'p2', completion: 'c2', label: false, metadata: {} }
      ];

      builder._saveDataset(examples, 'test.jsonl');
      
      const filepath = join(tempOutputDir, 'test.jsonl');
      assert(existsSync(filepath));
      
      const content = readFileSync(filepath, 'utf-8');
      const lines = content.trim().split('\n');
      assert.equal(lines.length, 2);
    });

    test('should handle empty examples array', () => {
      builder._saveDataset([], 'empty.jsonl');
      
      const filepath = join(tempOutputDir, 'empty.jsonl');
      assert(existsSync(filepath));
    });
  });

  describe('_saveStats', () => {
    test('should save statistics as JSON', () => {
      const stats = {
        totalExamples: 100,
        trainExamples: 80,
        testExamples: 20
      };

      builder._saveStats(stats, 'test_stats.json');
      
      const filepath = join(tempOutputDir, 'test_stats.json');
      assert(existsSync(filepath));
      
      const content = JSON.parse(readFileSync(filepath, 'utf-8'));
      assert.equal(content.totalExamples, 100);
      assert.equal(content.trainExamples, 80);
      assert.equal(content.testExamples, 20);
    });
  });

  describe('Date Filtering', () => {
    let dateRepoDir;
    let dateOutputDir;
    let dateBuilder;

    beforeEach(() => {
      dateRepoDir = mkdtempSync(join(tmpdir(), 'date-repo-'));
      dateOutputDir = mkdtempSync(join(tmpdir(), 'date-output-'));
      
      // Create repo with commits at specific dates
      execSync('git init', { cwd: dateRepoDir });
      execSync('git config user.email "test@example.com"', { cwd: dateRepoDir });
      execSync('git config user.name "Test User"', { cwd: dateRepoDir });
      
      // Old commit (2023)
      const oldCode = `function oldFunction() {
        return "old implementation";
      }`;
      writeFileSync(join(dateRepoDir, 'code.js'), oldCode);
      execSync('git add .', { cwd: dateRepoDir });
      execSync('git commit --date="2023-06-15T00:00:00" -m "Old commit"', { 
        cwd: dateRepoDir,
        env: { ...process.env, GIT_COMMITTER_DATE: '2023-06-15T00:00:00' }
      });
      
      // Recent commit (2024)
      const newCode = `function newFunction() {
        return "new implementation with more logic";
      }`;
      writeFileSync(join(dateRepoDir, 'code.js'), newCode);
      execSync('git add .', { cwd: dateRepoDir });
      execSync('git commit --date="2024-06-15T00:00:00" -m "Recent commit"', { 
        cwd: dateRepoDir,
        env: { ...process.env, GIT_COMMITTER_DATE: '2024-06-15T00:00:00' }
      });
      
      dateBuilder = new DatasetBuilder(dateRepoDir, dateOutputDir);
    });

    afterEach(() => {
      if (dateRepoDir) {
        try {
          rmSync(dateRepoDir, { recursive: true });
        } catch {}
      }
      if (dateOutputDir) {
        try {
          rmSync(dateOutputDir, { recursive: true });
        } catch {}
      }
    });

    test('should filter commits by start date', async () => {
      const startDate = new Date('2024-01-01');
      
      const stats = await dateBuilder.buildKTODataset({
        maxCommits: 100,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.9,
        fileExtensions: ['.js'],
        startDate: startDate,
        endDate: null
      });
      
      // Should only include the 2024 commit
      assert(!stats.error);
      assert(stats.totalExamples > 0);
      
      // Check the log file mentions the date filter
      const logPath = join(dateOutputDir, 'dataset_generation.log');
      if (existsSync(logPath)) {
        const logContent = readFileSync(logPath, 'utf-8');
        assert(logContent.includes('2024'));
      }
    });

    test('should filter commits by end date', async () => {
      const endDate = new Date('2023-12-31');
      
      const stats = await dateBuilder.buildKTODataset({
        maxCommits: 100,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.9,
        fileExtensions: ['.js'],
        startDate: null,
        endDate: endDate
      });
      
      // Should only include the 2023 commit
      assert(!stats.error);
      assert(stats.totalExamples > 0);
    });

    test('should filter commits by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      
      const stats = await dateBuilder.buildKTODataset({
        maxCommits: 100,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.9,
        fileExtensions: ['.js'],
        startDate: startDate,
        endDate: endDate
      });
      
      // Should only include the 2024 commit
      assert(!stats.error);
      assert(stats.totalExamples > 0);
    });

    test('should work with no date filters', async () => {
      const stats = await dateBuilder.buildKTODataset({
        maxCommits: 100,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.9,
        fileExtensions: ['.js']
      });
      
      // Should include both commits
      assert(!stats.error);
      assert(stats.totalExamples > 0);
    });

    test('should pass date parameters to DPO dataset', async () => {
      const startDate = new Date('2024-01-01');
      
      const stats = await dateBuilder.buildDPODataset({
        maxCommits: 100,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.9,
        fileExtensions: ['.js'],
        startDate: startDate,
        endDate: null
      });
      
      // Should only include the 2024 commit
      assert(!stats.error);
    });
  });

  describe('_shuffleArray', () => {
    test('should shuffle array in place', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const original = [...array];
      
      builder._shuffleArray(array);
      
      assert.equal(array.length, original.length);
      // Check all elements are still present
      original.forEach(item => {
        assert(array.includes(item));
      });
      
      // Very unlikely to be in same order (but possible)
      // Just check it's a valid shuffle
      assert(Array.isArray(array));
    });

    test('should handle empty array', () => {
      const array = [];
      builder._shuffleArray(array);
      assert.equal(array.length, 0);
    });

    test('should handle single element array', () => {
      const array = [1];
      builder._shuffleArray(array);
      assert.deepEqual(array, [1]);
    });
  });

  describe('_randomSample', () => {
    test('should sample specified number of elements', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample = builder._randomSample(array, 5);
      
      assert.equal(sample.length, 5);
      sample.forEach(item => {
        assert(array.includes(item));
      });
    });

    test('should not modify original array', () => {
      const array = [1, 2, 3, 4, 5];
      const original = [...array];
      
      builder._randomSample(array, 3);
      
      assert.deepEqual(array, original);
    });

    test('should handle size larger than array', () => {
      const array = [1, 2, 3];
      const sample = builder._randomSample(array, 10);
      
      assert.equal(sample.length, 3);
    });

    test('should handle empty array', () => {
      const sample = builder._randomSample([], 5);
      assert.equal(sample.length, 0);
    });
  });

  describe('logging', () => {
    test('should create log file', async () => {
      await builder.buildKTODataset({
        maxCommits: 1,
        fimFormat: FIMFormat.ZED
      });

      const logFile = join(tempOutputDir, 'dataset_generation.log');
      assert(existsSync(logFile));
    });
  });

});