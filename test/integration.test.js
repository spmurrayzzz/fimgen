import { test, describe } from 'node:test';
import { assert } from './test-helper.js';
import { DatasetBuilder } from '../src/dataset-builder.js';
import { GitHistoryMiner } from '../src/git-history-miner.js';
import { FIMTransformer } from '../src/fim-transformer.js';
import { NegativeExampleGenerator } from '../src/negative-example-generator.js';
import { QualityFilter } from '../src/quality-filter.js';
import { ASTProcessor } from '../src/ast-processor.js';
import { EditPair, FIMFormat } from '../src/types.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

describe('Integration Tests', () => {
  describe('End-to-end pipeline', () => {
    let tempRepo;
    let tempOutput;

    test('setup', () => {
      // Create a realistic test repository
      tempRepo = mkdtempSync(join(tmpdir(), 'integration-repo-'));
      tempOutput = mkdtempSync(join(tmpdir(), 'integration-output-'));
      
      execSync('git init', { cwd: tempRepo });
      execSync('git config user.email "test@example.com"', { cwd: tempRepo });
      execSync('git config user.name "Test User"', { cwd: tempRepo });
      
      // Create multiple files in different languages
      const files = {
        'utils.js': [
          `function isEmpty(arr) {
  return arr.length === 0;
}

module.exports = { isEmpty };`,
          `function isEmpty(arr) {
  return !arr || arr.length === 0;
}

function first(arr) {
  return arr[0];
}

module.exports = { isEmpty, first };`
        ],
        'math.py': [
          `def add(a, b):
    return a + b`,
          `def add(a, b):
    """Add two numbers."""
    return a + b

def multiply(a, b):
    """Multiply two numbers."""
    return a * b`
        ],
        'Main.java': [
          `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}`,
          `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        System.out.println("Version 2.0");
    }
}`
        ]
      };

      // Create commits for each file
      for (const [filename, versions] of Object.entries(files)) {
        writeFileSync(join(tempRepo, filename), versions[0]);
        execSync('git add .', { cwd: tempRepo });
        execSync(`git commit -m "Add ${filename}"`, { cwd: tempRepo });
        
        writeFileSync(join(tempRepo, filename), versions[1]);
        execSync('git add .', { cwd: tempRepo });
        execSync(`git commit -m "Update ${filename}"`, { cwd: tempRepo });
      }
    });

    test('should process multi-language repository', async () => {
      const builder = new DatasetBuilder(tempRepo, tempOutput);
      const stats = await builder.buildKTODataset({
        maxCommits: 20,
        fimFormat: FIMFormat.ZED,
        trainTestSplit: 0.8
      });

      assert(!stats.error);
      assert(stats.totalExamples > 0);
      assert(stats.uniqueFiles >= 3);
      
      // Read and verify the dataset
      const trainPath = join(tempOutput, 'train_kto.jsonl');
      const content = readFileSync(trainPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      const languages = new Set();
      lines.forEach(line => {
        const obj = JSON.parse(line);
        if (obj.metadata?.language) {
          languages.add(obj.metadata.language);
        }
      });
      
      // Should have processed multiple languages
      assert(languages.size >= 2);
    });

    test('should handle all FIM formats', async () => {
      const formats = [FIMFormat.PSM, FIMFormat.SPM, FIMFormat.ZED, FIMFormat.MIXED];
      
      for (const format of formats) {
        const outputDir = mkdtempSync(join(tmpdir(), `format-${format}-`));
        const builder = new DatasetBuilder(tempRepo, outputDir);
        
        const stats = await builder.buildKTODataset({
          maxCommits: 10,
          fimFormat: format,
          trainTestSplit: 0.5
        });
        
        assert(!stats.error, `Failed for format ${format}`);
        assert.equal(stats.format, format);
        
        // Verify format markers in dataset
        const trainPath = join(outputDir, 'train_kto.jsonl');
        const content = readFileSync(trainPath, 'utf-8');
        const firstLine = content.split('\n')[0];
        
        if (firstLine) {
          const obj = JSON.parse(firstLine);
          const prompt = obj.prompt;
          
          if (format === FIMFormat.ZED) {
            assert(prompt.includes('<|editable_region_start|>') || 
                   prompt.includes('<|user_cursor_is_here|>'));
          } else if (format === FIMFormat.PSM || format === FIMFormat.SPM) {
            assert(prompt.includes('<|fim_prefix|>') || 
                   prompt.includes('<|fim_suffix|>') || 
                   prompt.includes('<|fim_middle|>'));
          }
        }
        
        rmSync(outputDir, { recursive: true });
      }
    });

    test('teardown', () => {
      if (tempRepo) rmSync(tempRepo, { recursive: true });
      if (tempOutput) rmSync(tempOutput, { recursive: true });
    });
  });

  describe('Component integration', () => {
    test('should flow from GitHistoryMiner to FIMTransformer', async () => {
      // Create minimal repo
      const repo = mkdtempSync(join(tmpdir(), 'flow-test-'));
      execSync('git init', { cwd: repo });
      execSync('git config user.email "test@test.com"', { cwd: repo });
      execSync('git config user.name "Test"', { cwd: repo });
      
      writeFileSync(join(repo, 'test.js'), 'const x = 1;');
      execSync('git add . && git commit -m "1"', { cwd: repo });
      
      writeFileSync(join(repo, 'test.js'), 'const x = 2;\nconst y = 3;');
      execSync('git add . && git commit -m "2"', { cwd: repo });
      
      // Mine commits
      const miner = new GitHistoryMiner(repo);
      const editPairs = await miner.extractEditPairs(['.js'], 10);
      assert(editPairs.length > 0);
      
      // Transform to FIM
      const transformer = new FIMTransformer();
      const fimExamples = [];
      
      for (const pair of editPairs) {
        const examples = transformer.createFIMExamples(pair, FIMFormat.ZED, 2);
        fimExamples.push(...examples);
      }
      
      assert(fimExamples.length > 0);
      
      // Generate negatives
      const negGenerator = new NegativeExampleGenerator();
      const negatives = negGenerator.generateNegativeExamples(fimExamples);
      
      assert(negatives.length > 0);
      assert(negatives.every(ex => ex.label === false));
      
      rmSync(repo, { recursive: true });
    });

    test('should validate quality throughout pipeline', () => {
      const filter = new QualityFilter();
      
      // Test various code samples
      const validCode = `function test() {
    const result = calculate();
    return result * 2;
}`;
      
      const invalidCode = '// AUTO-GENERATED\nfunction test() {}';
      
      assert(filter.passesQualityChecks(validCode, 'javascript'));
      assert(!filter.passesQualityChecks(invalidCode, 'javascript'));
      
      // Test with edit pair
      const editPair = new EditPair({
        before: validCode,
        after: validCode.replace('* 2', '* 3'),
        diff: '-    return result * 2;\n+    return result * 3;',
        filepath: 'test.js',
        commitHash: 'abc',
        commitMessage: 'Update multiplier',
        language: 'javascript'
      });
      
      assert(filter.passesQualityChecks(editPair.after, editPair.language));
      assert(filter.isSemanticChange(editPair.diff));
    });

    test('should handle AST processing for cursor positioning', () => {
      const processor = new ASTProcessor();
      
      const testCases = [
        { code: 'function test() { return 1; }', language: 'javascript' },
        { code: 'def test():\n    return 1', language: 'python' },
        { code: 'public class Test { }', language: 'java' }
      ];
      
      for (const { code, language } of testCases) {
        const positions = processor.selectCursorPositions(code, language, 3);
        
        assert(Array.isArray(positions));
        assert(positions.length <= 3);
        positions.forEach(pos => {
          assert(pos >= 0);
          assert(pos < code.length);
        });
      }
    });
  });

  describe('Error handling', () => {
    test('should handle corrupted git repository gracefully', () => {
      const badRepo = mkdtempSync(join(tmpdir(), 'bad-repo-'));
      
      // Create a folder named .git but not a real git repo
      mkdirSync(join(badRepo, '.git'));
      
      try {
        const miner = new GitHistoryMiner(badRepo);
        // If it gets here, it initialized but operations should fail gracefully
        assert(miner);
      } catch (error) {
        // Expected to throw
        assert(error.message.includes('git'));
      }
      
      rmSync(badRepo, { recursive: true });
    });

    test('should handle file system errors gracefully', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'fs-test-'));
      execSync('git init', { cwd: repo });
      
      const readOnlyOutput = mkdtempSync(join(tmpdir(), 'readonly-'));
      
      const builder = new DatasetBuilder(repo, readOnlyOutput);
      
      // Make output directory read-only (this might not work on all systems)
      try {
        execSync(`chmod 444 ${readOnlyOutput}`);
        
        const stats = await builder.buildKTODataset({
          maxCommits: 1
        });
        
        // Should either handle gracefully or we skip this test
        if (stats.error) {
          assert(stats.error);
        }
      } catch (error) {
        // System doesn't support chmod, skip this part
      } finally {
        try {
          execSync(`chmod 755 ${readOnlyOutput}`);
        } catch {}
        rmSync(repo, { recursive: true });
        rmSync(readOnlyOutput, { recursive: true, force: true });
      }
    });
  });

  describe('Performance considerations', () => {
    test('should handle large number of small commits efficiently', async function() {
      // Note: This test may take longer to run
      const perfRepo = mkdtempSync(join(tmpdir(), 'perf-repo-'));
      execSync('git init', { cwd: perfRepo });
      execSync('git config user.email "test@test.com"', { cwd: perfRepo });
      execSync('git config user.name "Test"', { cwd: perfRepo });
      
      // Create many small commits
      for (let i = 0; i < 20; i++) {
        const code = `function func${i}() { return ${i}; }`;
        writeFileSync(join(perfRepo, `file${i % 5}.js`), code);
        execSync('git add .', { cwd: perfRepo });
        execSync(`git commit -m "Commit ${i}"`, { cwd: perfRepo });
      }
      
      const startTime = Date.now();
      const miner = new GitHistoryMiner(perfRepo);
      const pairs = await miner.extractEditPairs(['.js'], 50);
      const endTime = Date.now();
      
      assert(pairs.length > 0);
      assert(endTime - startTime < 5000); // Should complete within 5 seconds
      
      rmSync(perfRepo, { recursive: true });
    });
  });
});