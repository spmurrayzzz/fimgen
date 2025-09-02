import { test, describe, beforeEach, afterEach } from 'node:test';
import { assert, assertThrows } from './test-helper.js';
import { GitHistoryMiner } from '../src/git-history-miner.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

describe('GitHistoryMiner', () => {
  let tempDir;
  let miner;

  function createTempGitRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'fim-test-'));
    
    // Initialize git repo
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@example.com"', { cwd: dir });
    execSync('git config user.name "Test User"', { cwd: dir });
    
    // Create initial commit
    writeFileSync(join(dir, 'test.js'), 'function old() { return 1; }');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "Initial commit"', { cwd: dir });
    
    // Create second commit
    writeFileSync(join(dir, 'test.js'), 'function new() { return 2; }');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "Update function"', { cwd: dir });
    
    return dir;
  }

  beforeEach(() => {
    tempDir = createTempGitRepo();
    miner = new GitHistoryMiner(tempDir);
  });

  afterEach(() => {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true });
      } catch {}
    }
  });

  test('should create instance', () => {
    assert(miner instanceof GitHistoryMiner);
  });

  describe('constructor', () => {
    test('should accept valid repository path', () => {
      const m = new GitHistoryMiner(tempDir);
      assert(m.repoPath.includes('fim-test-'));
    });

    test('should throw for invalid repository path', () => {
      assertThrows(() => {
        new GitHistoryMiner('/nonexistent/path');
      }, 'Invalid git repository');
    });

    test('should throw for non-git directory', () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'not-git-'));
      try {
        assertThrows(() => {
          new GitHistoryMiner(nonGitDir);
        }, 'Invalid git repository');
      } finally {
        rmSync(nonGitDir, { recursive: true });
      }
    });

    test('should initialize quality filter', () => {
      const m = new GitHistoryMiner(tempDir);
      assert(m.qualityFilter);
    });
  });

  describe('extractEditPairs', () => {
    test('should extract edit pairs from commits', async () => {
      const pairs = await miner.extractEditPairs(['.js'], 10);
      assert(Array.isArray(pairs));
      assert(pairs.length > 0);
      
      const pair = pairs[0];
      assert(pair.filepath);
      assert(pair.commitHash);
      assert(pair.language);
    });

    test('should use default file extensions', async () => {
      const pairs = await miner.extractEditPairs(null, 10);
      assert(Array.isArray(pairs));
    });

    test('should respect max commits limit', async () => {
      // Add more commits
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(tempDir, 'test.js'), `function test${i}() { return ${i}; }`);
        execSync('git add .', { cwd: tempDir });
        execSync(`git commit -m "Commit ${i}"`, { cwd: tempDir });
      }
      
      const miner2 = new GitHistoryMiner(tempDir);
      const pairs = await miner2.extractEditPairs(['.js'], 2);
      
      // Should process at most 2 commits
      assert(pairs.length <= 2);
    });

    test('should filter by file extensions', async () => {
      // Add Python file
      writeFileSync(join(tempDir, 'test.py'), 'def test(): return 1');
      execSync('git add .', { cwd: tempDir });
      execSync('git commit -m "Add Python"', { cwd: tempDir });
      
      writeFileSync(join(tempDir, 'test.py'), 'def test(): return 2');
      execSync('git add .', { cwd: tempDir });
      execSync('git commit -m "Update Python"', { cwd: tempDir });
      
      const miner3 = new GitHistoryMiner(tempDir);
      const jsPairs = await miner3.extractEditPairs(['.js'], 100);
      const pyPairs = await miner3.extractEditPairs(['.py'], 100);
      
      jsPairs.forEach(p => assert(p.filepath.endsWith('.js')));
      pyPairs.forEach(p => assert(p.filepath.endsWith('.py')));
    });

    test('should handle repository with no commits', async () => {
      const emptyRepo = mkdtempSync(join(tmpdir(), 'empty-repo-'));
      try {
        execSync('git init', { cwd: emptyRepo });
        const emptyMiner = new GitHistoryMiner(emptyRepo);
        const pairs = await emptyMiner.extractEditPairs();
        assert(Array.isArray(pairs));
        assert.equal(pairs.length, 0);
      } finally {
        rmSync(emptyRepo, { recursive: true });
      }
    });

    test('should filter commits by date range', async () => {
      // Create a repo with commits at different dates
      const dateRepo = mkdtempSync(join(tmpdir(), 'date-test-'));
      try {
        execSync('git init', { cwd: dateRepo });
        execSync('git config user.email "test@example.com"', { cwd: dateRepo });
        execSync('git config user.name "Test User"', { cwd: dateRepo });
        
        // Commit from 2023
        writeFileSync(join(dateRepo, 'test.js'), 'function old() { return 1; }');
        execSync('git add .', { cwd: dateRepo });
        execSync('git commit --date="2023-01-15T00:00:00" -m "Old commit"', { 
          cwd: dateRepo,
          env: { ...process.env, GIT_COMMITTER_DATE: '2023-01-15T00:00:00' }
        });
        
        // Commit from 2024
        writeFileSync(join(dateRepo, 'test.js'), 'function new() { return 2; }');
        execSync('git add .', { cwd: dateRepo });
        execSync('git commit --date="2024-06-15T00:00:00" -m "New commit"', { 
          cwd: dateRepo,
          env: { ...process.env, GIT_COMMITTER_DATE: '2024-06-15T00:00:00' }
        });
        
        const dateMiner = new GitHistoryMiner(dateRepo);
        
        // Test with date range that includes only 2024 commit
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-12-31');
        const filteredPairs = await dateMiner.extractEditPairs(['.js'], 100, startDate, endDate);
        
        assert.equal(filteredPairs.length, 1);
        assert(filteredPairs[0].commitMessage.includes('New commit'));
        
        // Test with date range that includes only 2023 commit
        const oldStartDate = new Date('2023-01-01');
        const oldEndDate = new Date('2023-12-31');
        const oldPairs = await dateMiner.extractEditPairs(['.js'], 100, oldStartDate, oldEndDate);
        
        assert.equal(oldPairs.length, 1);
        assert(oldPairs[0].commitMessage.includes('Old commit'));
        
        // Test with no date filters - should get both
        const allPairs = await dateMiner.extractEditPairs(['.js'], 100);
        assert.equal(allPairs.length, 2);
      } finally {
        rmSync(dateRepo, { recursive: true });
      }
    });
  });

  describe('_detectLanguage', () => {
    test('should detect common languages', () => {
      assert.equal(miner._detectLanguage('test.py'), 'python');
      assert.equal(miner._detectLanguage('test.js'), 'javascript');
      assert.equal(miner._detectLanguage('test.jsx'), 'javascript');
      assert.equal(miner._detectLanguage('test.ts'), 'typescript');
      assert.equal(miner._detectLanguage('test.tsx'), 'typescript');
      assert.equal(miner._detectLanguage('test.java'), 'java');
      assert.equal(miner._detectLanguage('test.cpp'), 'cpp');
      assert.equal(miner._detectLanguage('test.c'), 'c');
      assert.equal(miner._detectLanguage('test.go'), 'go');
      assert.equal(miner._detectLanguage('test.rs'), 'rust');
    });

    test('should handle uppercase extensions', () => {
      assert.equal(miner._detectLanguage('TEST.PY'), 'python');
      assert.equal(miner._detectLanguage('Test.JS'), 'javascript');
    });

    test('should return unknown for unsupported extensions', () => {
      assert.equal(miner._detectLanguage('test.txt'), 'unknown');
      assert.equal(miner._detectLanguage('test.md'), 'unknown');
      assert.equal(miner._detectLanguage('test'), 'unknown');
    });

    test('should handle complex filenames', () => {
      assert.equal(miner._detectLanguage('my.test.file.py'), 'python');
      assert.equal(miner._detectLanguage('.hidden.js'), 'javascript');
    });
  });

  describe('_shouldProcessFile', () => {
    test('should accept matching extensions', () => {
      assert(miner._shouldProcessFile('test.js', ['.js', '.py']));
      assert(miner._shouldProcessFile('test.py', ['.js', '.py']));
    });

    test('should reject non-matching extensions', () => {
      assert(!miner._shouldProcessFile('test.txt', ['.js', '.py']));
      assert(!miner._shouldProcessFile('test.md', ['.js']));
    });

    test('should be case insensitive', () => {
      assert(miner._shouldProcessFile('TEST.JS', ['.js']));
      assert(miner._shouldProcessFile('test.JS', ['.js']));
    });

    test('should handle paths with directories', () => {
      assert(miner._shouldProcessFile('src/components/test.js', ['.js']));
      assert(miner._shouldProcessFile('/absolute/path/file.py', ['.py']));
    });
  });

  describe('_parseGitDiff', () => {
    test('should parse single file diff', () => {
      const diff = `diff --git a/test.js b/test.js
index abc123..def456 100644
--- a/test.js
+++ b/test.js
@@ -1 +1 @@
-old line
+new line`;

      const files = miner._parseGitDiff(diff);
      assert.equal(files.length, 1);
      assert.equal(files[0].path, 'test.js');
      assert(files[0].diff.includes('old line'));
      assert(files[0].diff.includes('new line'));
    });

    test('should parse multiple file diffs', () => {
      const diff = `diff --git a/file1.js b/file1.js
index abc..def 100644
--- a/file1.js
+++ b/file1.js
@@ -1 +1 @@
-old1
+new1
diff --git a/file2.py b/file2.py
index 123..456 100644
--- a/file2.py
+++ b/file2.py
@@ -1 +1 @@
-old2
+new2`;

      const files = miner._parseGitDiff(diff);
      assert.equal(files.length, 2);
      assert.equal(files[0].path, 'file1.js');
      assert.equal(files[1].path, 'file2.py');
    });

    test('should handle empty diff', () => {
      const files = miner._parseGitDiff('');
      assert(Array.isArray(files));
      assert.equal(files.length, 0);
    });

    test('should handle malformed diff', () => {
      const files = miner._parseGitDiff('not a valid diff');
      assert(Array.isArray(files));
    });
  });

});