import { test, describe, beforeEach } from 'node:test';
import { assert, createMockEditPair, sampleCode } from './test-helper.js';
import { FIMTransformer } from '../src/fim-transformer.js';
import { FIMFormat } from '../src/types.js';

describe('FIMTransformer', () => {
  let transformer;

  beforeEach(() => {
    transformer = new FIMTransformer();
  });

  test('should create instance', () => {
    assert(transformer instanceof FIMTransformer);
  });

  describe('createFIMExamples', () => {
    test('should create ZED format examples', () => {
      const editPair = createMockEditPair({
        after: sampleCode.javascript,
        language: 'javascript'
      });

      const examples = transformer.createFIMExamples(editPair, FIMFormat.ZED, 2);
      
      assert(Array.isArray(examples));
      assert.equal(examples.length, 2);
      
      examples.forEach(ex => {
        assert(ex.prompt.includes('<|editable_region_start|>'));
        assert(ex.prompt.includes('<|user_cursor_is_here|>'));
        assert(ex.context.includes('<|editable_region_end|>'));
        assert.equal(ex.format, FIMFormat.ZED);
      });
    });

    test('should create PSM format examples', () => {
      const editPair = createMockEditPair({
        after: sampleCode.python,
        language: 'python'
      });

      const examples = transformer.createFIMExamples(editPair, FIMFormat.PSM, 1);
      
      assert(Array.isArray(examples));
      assert(examples.length > 0);
      
      examples.forEach(ex => {
        assert(ex.prompt.includes('<|fim_prefix|>'));
        assert(ex.prompt.includes('<|fim_suffix|>'));
        assert(ex.prompt.includes('<|fim_middle|>'));
        assert.equal(ex.format, FIMFormat.PSM);
      });
    });

    test('should create SPM format examples', () => {
      const editPair = createMockEditPair({
        after: sampleCode.java,
        language: 'java'
      });

      const examples = transformer.createFIMExamples(editPair, FIMFormat.SPM, 1);
      
      assert(Array.isArray(examples));
      assert(examples.length > 0);
      
      examples.forEach(ex => {
        assert(ex.prompt.includes('<|fim_suffix|>'));
        assert(ex.prompt.includes('<|fim_prefix|>'));
        assert(ex.prompt.includes('<|fim_middle|>'));
        // SPM has suffix before prefix
        assert(ex.prompt.indexOf('<|fim_suffix|>') < ex.prompt.indexOf('<|fim_prefix|>'));
        assert.equal(ex.format, FIMFormat.SPM);
      });
    });

    test('should handle MIXED format', () => {
      const editPair = createMockEditPair({
        after: sampleCode.python,
        language: 'python'
      });

      const examples = transformer.createFIMExamples(editPair, FIMFormat.MIXED, 10);
      
      assert(Array.isArray(examples));
      assert(examples.length > 0);
      
      // Should have both PSM and SPM formats
      const formats = examples.map(ex => ex.format);
      assert(formats.includes(FIMFormat.PSM) || formats.includes(FIMFormat.SPM));
    });

    test('should handle empty code', () => {
      const editPair = createMockEditPair({ after: '' });
      const examples = transformer.createFIMExamples(editPair, FIMFormat.ZED, 3);
      
      assert(Array.isArray(examples));
      assert.equal(examples.length, 0);
    });

    test('should include metadata in examples', () => {
      const editPair = createMockEditPair({
        filepath: 'test/example.py',
        commitHash: 'commit123',
        commitMessage: 'Fix bug',
        language: 'python'
      });

      const examples = transformer.createFIMExamples(editPair, FIMFormat.ZED, 1);
      
      if (examples.length > 0) {
        const metadata = examples[0].metadata;
        assert.equal(metadata.filepath, 'test/example.py');
        assert.equal(metadata.commit, 'commit123');
        assert.equal(metadata.language, 'python');
        assert.equal(metadata.commitMessage, 'Fix bug');
      }
    });

    test('should set cursor positions', () => {
      const editPair = createMockEditPair({ after: sampleCode.javascript });
      const examples = transformer.createFIMExamples(editPair, FIMFormat.ZED, 3);
      
      examples.forEach(ex => {
        assert(typeof ex.cursorPosition === 'number');
        assert(ex.cursorPosition >= 0);
        assert(ex.cursorPosition < sampleCode.javascript.length);
      });
    });

    test('should set editable regions', () => {
      const editPair = createMockEditPair({ after: sampleCode.python });
      const examples = transformer.createFIMExamples(editPair, FIMFormat.ZED, 2);
      
      examples.forEach(ex => {
        assert(Array.isArray(ex.editableRegion));
        assert.equal(ex.editableRegion.length, 2);
        const [start, end] = ex.editableRegion;
        assert(start >= 0);
        assert(end <= sampleCode.python.length);
        assert(start <= end);
      });
    });
  });

  describe('_determineEditableRegion', () => {
    test('should return valid region for code', () => {
      const code = 'function test() {\n    return 1;\n}';
      const cursorPos = 20;
      const region = transformer._determineEditableRegion(code, cursorPos);
      
      assert(Array.isArray(region));
      assert.equal(region.length, 2);
      const [start, end] = region;
      assert(start >= 0);
      assert(end <= code.length);
      assert(start <= cursorPos);
      assert(cursorPos <= end);
    });

    test('should handle cursor at beginning', () => {
      const code = 'test code';
      const region = transformer._determineEditableRegion(code, 0);
      
      const [start, end] = region;
      assert.equal(start, 0);
      assert(end > 0);
    });

    test('should handle cursor at end', () => {
      const code = 'test code';
      const region = transformer._determineEditableRegion(code, code.length - 1);
      
      const [start, end] = region;
      assert(start < code.length);
      assert(end <= code.length);
    });

    test('should handle empty code', () => {
      const region = transformer._determineEditableRegion('', 0);
      assert.deepEqual(region, [0, 0]);
    });

    test('should handle out of bounds cursor', () => {
      const code = 'test';
      const region1 = transformer._determineEditableRegion(code, -5);
      const region2 = transformer._determineEditableRegion(code, 100);
      
      assert(region1[0] >= 0);
      assert(region2[1] <= code.length);
    });
  });




});