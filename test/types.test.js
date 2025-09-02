import { test, describe } from 'node:test';
import { assert } from './test-helper.js';
import { FIMFormat, EditPair, FIMExample, KTOExample } from '../src/types.js';

describe('FIMFormat', () => {
  test('should have all expected formats', () => {
    assert.equal(FIMFormat.PSM, 'prefix_suffix_middle');
    assert.equal(FIMFormat.SPM, 'suffix_prefix_middle');
    assert.equal(FIMFormat.ZED, 'zed_format');
    assert.equal(FIMFormat.MIXED, 'mixed');
  });

  test('should be usable as enum keys', () => {
    const formats = Object.keys(FIMFormat);
    assert.deepEqual(formats, ['PSM', 'SPM', 'ZED', 'MIXED']);
  });
});

describe('EditPair', () => {
  test('should create with all properties', () => {
    const editPair = new EditPair({
      before: 'old code',
      after: 'new code',
      diff: 'diff text',
      filepath: 'test.js',
      commitHash: 'abc123',
      commitMessage: 'test commit',
      language: 'javascript',
      contextFiles: ['file1.js', 'file2.js']
    });

    assert.equal(editPair.before, 'old code');
    assert.equal(editPair.after, 'new code');
    assert.equal(editPair.diff, 'diff text');
    assert.equal(editPair.filepath, 'test.js');
    assert.equal(editPair.commitHash, 'abc123');
    assert.equal(editPair.commitMessage, 'test commit');
    assert.equal(editPair.language, 'javascript');
    assert.deepEqual(editPair.contextFiles, ['file1.js', 'file2.js']);
  });

  test('should handle missing contextFiles', () => {
    const editPair = new EditPair({
      before: 'old',
      after: 'new',
      diff: 'diff',
      filepath: 'test.js',
      commitHash: 'abc',
      commitMessage: 'msg',
      language: 'js'
    });

    assert.deepEqual(editPair.contextFiles, []);
  });

  test('should handle undefined contextFiles', () => {
    const editPair = new EditPair({
      before: 'old',
      after: 'new',
      diff: 'diff',
      filepath: 'test.js',
      commitHash: 'abc',
      commitMessage: 'msg',
      language: 'js',
      contextFiles: undefined
    });

    assert.deepEqual(editPair.contextFiles, []);
  });
});

describe('FIMExample', () => {
  test('should create with all properties', () => {
    const example = new FIMExample({
      prompt: 'test prompt',
      completion: 'test completion',
      context: 'test context',
      format: 'zed_format',
      cursorPosition: 10,
      editableRegion: [5, 15],
      metadata: { test: 'data' }
    });

    assert.equal(example.prompt, 'test prompt');
    assert.equal(example.completion, 'test completion');
    assert.equal(example.context, 'test context');
    assert.equal(example.format, 'zed_format');
    assert.equal(example.cursorPosition, 10);
    assert.deepEqual(example.editableRegion, [5, 15]);
    assert.deepEqual(example.metadata, { test: 'data' });
  });

  test('should handle missing metadata', () => {
    const example = new FIMExample({
      prompt: 'prompt',
      completion: 'completion',
      context: 'context',
      format: 'psm',
      cursorPosition: 0,
      editableRegion: [0, 10]
    });

    assert.deepEqual(example.metadata, {});
  });

  test('should store complex metadata', () => {
    const metadata = {
      filepath: 'src/test.js',
      language: 'javascript',
      commit: 'abc123',
      nested: {
        value: 42,
        array: [1, 2, 3]
      }
    };

    const example = new FIMExample({
      prompt: 'p',
      completion: 'c',
      context: 'ctx',
      format: 'fmt',
      cursorPosition: 0,
      editableRegion: [0, 1],
      metadata
    });

    assert.deepEqual(example.metadata, metadata);
  });
});

describe('KTOExample', () => {
  test('should create with positive label', () => {
    const example = new KTOExample({
      prompt: 'test prompt',
      completion: 'test completion',
      label: true,
      metadata: { test: 'data' }
    });

    assert.equal(example.prompt, 'test prompt');
    assert.equal(example.completion, 'test completion');
    assert.equal(example.label, true);
    assert.deepEqual(example.metadata, { test: 'data' });
  });

  test('should create with negative label', () => {
    const example = new KTOExample({
      prompt: 'prompt',
      completion: 'completion',
      label: false,
      metadata: { degradation: 'subtle_bugs' }
    });

    assert.equal(example.label, false);
    assert.equal(example.metadata.degradation, 'subtle_bugs');
  });

  test('should handle missing metadata', () => {
    const example = new KTOExample({
      prompt: 'p',
      completion: 'c',
      label: true
    });

    assert.deepEqual(example.metadata, {});
  });

  test('should handle boolean label correctly', () => {
    const positive = new KTOExample({
      prompt: 'p',
      completion: 'c',
      label: true
    });

    const negative = new KTOExample({
      prompt: 'p',
      completion: 'c',
      label: false
    });

    assert.strictEqual(positive.label, true);
    assert.strictEqual(negative.label, false);
    assert.notEqual(positive.label, negative.label);
  });
});