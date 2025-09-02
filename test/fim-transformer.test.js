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

  describe('_findBlockStart', () => {
    test('should find start of Python block', () => {
      const lines = [
        'def test():',
        '    if True:',
        '        x = 1',
        '        y = 2',
        '    return x'
      ];
      
      const start = transformer._findBlockStart(lines, 3); // y = 2 line
      assert.equal(start, 2); // Should start at x = 1
    });

    test('should find start of JavaScript block', () => {
      const lines = [
        'function test() {',
        '    if (true) {',
        '        const x = 1;',
        '        const y = 2;',
        '    }',
        '}'
      ];
      
      const start = transformer._findBlockStart(lines, 3);
      assert.equal(start, 2);
    });

    test('should handle no indentation', () => {
      const lines = ['line1', 'line2', 'line3'];
      const start = transformer._findBlockStart(lines, 1);
      assert.equal(start, 0);
    });

    test('should handle empty lines array', () => {
      const start = transformer._findBlockStart([], 0);
      assert.equal(start, 0);
    });

    test('should handle out of bounds line number', () => {
      const lines = ['line1', 'line2'];
      const start = transformer._findBlockStart(lines, 10);
      assert.equal(start, 0);
    });
  });

  describe('_findBlockEnd', () => {
    test('should find end of Python block', () => {
      const lines = [
        'def test():',
        '    x = 1',
        '    y = 2',
        '    return x',
        'def other():'
      ];
      
      const end = transformer._findBlockEnd(lines, 2); // y = 2 line
      assert.equal(end, 3);
    });

    test('should find end of JavaScript block', () => {
      const lines = [
        'function test() {',
        '    const x = 1;',
        '    const y = 2;',
        '}',
        'function other() {'
      ];
      
      const end = transformer._findBlockEnd(lines, 2);
      assert.equal(end, 2);
    });

    test('should handle last block in file', () => {
      const lines = [
        '    x = 1',
        '    y = 2'
      ];
      
      const end = transformer._findBlockEnd(lines, 0);
      assert.equal(end, 1);
    });

    test('should handle empty lines array', () => {
      const end = transformer._findBlockEnd([], 0);
      assert.equal(end, -1);
    });
  });

  describe('ZED format specifics', () => {
    test('should create proper ZED format markers', () => {
      const code = 'function test() { return 42; }';
      const editPair = createMockEditPair({ after: code });
      
      const example = transformer._createZedFormatExample(
        code, 15, [10, 25], editPair
      );
      
      assert(example);
      assert(example.prompt.includes('<|editable_region_start|>'));
      assert(example.prompt.includes('<|user_cursor_is_here|>'));
      assert(example.context.includes('<|editable_region_start|>'));
      assert(example.context.includes('<|editable_region_end|>'));
      assert(example.context.includes('<|user_cursor_is_here|>'));
    });

    test('should handle edge cases in ZED format', () => {
      const code = 'x';
      const editPair = createMockEditPair({ after: code });
      
      const example = transformer._createZedFormatExample(
        code, 0, [0, 1], editPair
      );
      
      assert(example);
      assert.equal(example.format, FIMFormat.ZED);
    });
  });

  describe('PSM/SPM format specifics', () => {
    test('PSM should have correct marker order', () => {
      const code = 'function test() { return 42; }';
      const editPair = createMockEditPair({ after: code });
      
      const example = transformer._createPSMFormatExample(
        code, 15, [10, 25], editPair
      );
      
      assert(example);
      const prompt = example.prompt;
      const prefixIdx = prompt.indexOf('<|fim_prefix|>');
      const suffixIdx = prompt.indexOf('<|fim_suffix|>');
      const middleIdx = prompt.indexOf('<|fim_middle|>');
      
      assert(prefixIdx < suffixIdx);
      assert(suffixIdx < middleIdx);
    });

    test('SPM should have suffix before prefix', () => {
      const code = 'function test() { return 42; }';
      const editPair = createMockEditPair({ after: code });
      
      const example = transformer._createSPMFormatExample(
        code, 15, [10, 25], editPair
      );
      
      assert(example);
      const prompt = example.prompt;
      const prefixIdx = prompt.indexOf('<|fim_prefix|>');
      const suffixIdx = prompt.indexOf('<|fim_suffix|>');
      const middleIdx = prompt.indexOf('<|fim_middle|>');
      
      assert(suffixIdx < prefixIdx);
      assert(prefixIdx < middleIdx);
    });

    test('should limit middle section size', () => {
      const code = 'x'.repeat(200);
      const editPair = createMockEditPair({ after: code });
      
      const example = transformer._createPSMFormatExample(
        code, 10, [0, 200], editPair
      );
      
      assert(example);
      assert(example.completion.length <= 50);
    });
  });
});