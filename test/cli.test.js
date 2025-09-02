import { test, describe } from 'node:test';
import { assert } from './test-helper.js';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('CLI Date Parsing', () => {
  const cliPath = join(process.cwd(), 'src', 'index.js');
  
  function runCLI(args) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [cliPath, ...args]);
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
      
      child.on('error', reject);
    });
  }

  test('should show help with --help flag', async () => {
    const result = await runCLI(['--help']);
    assert.equal(result.code, 0);
    assert(result.stdout.includes('--start-date'));
    assert(result.stdout.includes('--end-date'));
    assert(result.stdout.includes('YYYY-MM-DD'));
  });

  test('should reject invalid start-date format', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    try {
      const result = await runCLI([tempDir, '--start-date', 'invalid-date']);
      assert.equal(result.code, 1);
      assert(result.stderr.includes('Invalid start-date format'));
    } finally {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('should reject invalid end-date format', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    try {
      const result = await runCLI([tempDir, '--end-date', 'not-a-date']);
      assert.equal(result.code, 1);
      assert(result.stderr.includes('Invalid end-date format'));
    } finally {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('should reject when start-date is after end-date', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    try {
      const result = await runCLI([
        tempDir,
        '--start-date', '2024-12-31',
        '--end-date', '2024-01-01'
      ]);
      assert.equal(result.code, 1);
      assert(result.stderr.includes('start-date must be before end-date'));
    } finally {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('should accept valid date range', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    try {
      // This will fail because it's not a git repo, but it validates date parsing worked
      const result = await runCLI([
        tempDir,
        '--start-date', '2024-01-01',
        '--end-date', '2024-12-31'
      ]);
      // Should fail for different reason (not a git repo), not date validation
      assert.equal(result.code, 1);
      assert(!result.stderr.includes('Invalid start-date'));
      assert(!result.stderr.includes('Invalid end-date'));
      assert(!result.stderr.includes('must be before'));
    } finally {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('should accept only start-date', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    try {
      const result = await runCLI([tempDir, '--start-date', '2024-01-01']);
      // Should fail for different reason (not a git repo), not date validation
      assert.equal(result.code, 1);
      assert(!result.stderr.includes('Invalid start-date'));
    } finally {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('should accept only end-date', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    try {
      const result = await runCLI([tempDir, '--end-date', '2024-12-31']);
      // Should fail for different reason (not a git repo), not date validation
      assert.equal(result.code, 1);
      assert(!result.stderr.includes('Invalid end-date'));
    } finally {
      rmSync(tempDir, { recursive: true });
    }
  });
});