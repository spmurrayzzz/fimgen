import { test, describe } from 'node:test';
import { FIMExampleBuilder } from '../src/builders/fim-example-builder.js';
import { FIMFormat } from '../src/types.js';
import { ok, equal, deepEqual, throws } from './test-helper.js';

describe('FIMExampleBuilder', () => {
  const sampleCode = `function greet(name) {
    console.log('Hello, ' + name);
}`;
  
  const sampleEditPair = {
    filepath: 'test.js',
    commitHash: 'abc123',
    language: 'javascript',
    commitMessage: 'Add greeting function'
  };

  describe('Builder Pattern Flow', () => {
    test('should provide a fluent interface', () => {
      const builder = new FIMExampleBuilder();
      
      const result = builder
        .withCode(sampleCode)
        .withCursor(20)
        .withEditableRegion(0, 50)
        .withFormat(FIMFormat.ZED)
        .withMetadata(sampleEditPair);
      
      ok(result instanceof FIMExampleBuilder, 'Each method should return the builder');
    });

    test('should reset state properly', () => {
      const builder = new FIMExampleBuilder();
      
      builder
        .withCode(sampleCode)
        .withCursor(20)
        .withEditableRegion(0, 50)
        .withFormat(FIMFormat.ZED);
      
      builder.reset();
      
      throws(() => builder.build(), /Code is required/, 'Should throw after reset');
    });

    test('should clone builder state', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(20)
        .withEditableRegion(0, 50)
        .withFormat(FIMFormat.ZED)
        .withMetadata(sampleEditPair);
      
      const cloned = builder.clone();
      
      // Modify original
      builder.withCursor(30);
      
      // Build both
      const original = builder.build();
      const clonedExample = cloned.build();
      
      equal(original.cursorPosition, 30, 'Original should have new cursor position');
      equal(clonedExample.cursorPosition, 20, 'Cloned should have original cursor position');
    });
  });

  describe('Validation', () => {
    test('should require code before build', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withFormat(FIMFormat.ZED).build(),
        /Code is required/,
        'Should throw when code is missing'
      );
    });

    test('should require format before build', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withCode(sampleCode).withCursor(10).withEditableRegion(0, 50).build(),
        /Format is required/,
        'Should throw when format is missing'
      );
    });

    test('should require editable region before build', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withCode(sampleCode).withCursor(10).withFormat(FIMFormat.ZED).build(),
        /Editable region is required/,
        'Should throw when editable region is missing'
      );
    });

    test('should require cursor position before build', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withCode(sampleCode).withEditableRegion(0, 50).withFormat(FIMFormat.ZED).build(),
        /Cursor position is required/,
        'Should throw when cursor position is missing'
      );
    });

    test('should validate format values', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withFormat('invalid_format'),
        /Invalid format/,
        'Should throw for invalid format'
      );
    });

    test('should require code before setting cursor', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withCursor(10),
        /Must call withCode\(\) before withCursor\(\)/,
        'Should throw when setting cursor before code'
      );
    });

    test('should require code before setting editable region', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withEditableRegion(0, 50),
        /Must call withCode\(\) before withEditableRegion\(\)/,
        'Should throw when setting editable region before code'
      );
    });

    test('should reject empty code', () => {
      const builder = new FIMExampleBuilder();
      
      throws(
        () => builder.withCode(''),
        /Code cannot be empty/,
        'Should throw for empty code'
      );
    });
  });

  describe('Position Clamping', () => {
    test('should clamp cursor position to valid range', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(1000)  // Beyond code length
        .withEditableRegion(0, 50)
        .withFormat(FIMFormat.ZED);
      
      const example = builder.build();
      ok(example.cursorPosition < sampleCode.length, 'Cursor should be clamped to code length');
    });

    test('should clamp editable region to valid range', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(20)
        .withEditableRegion(-10, 1000)
        .withFormat(FIMFormat.ZED);
      
      const example = builder.build();
      equal(example.editableRegion[0], 0, 'Start should be clamped to 0');
      equal(example.editableRegion[1], sampleCode.length - 1, 'End should be clamped to code length');
    });

    test('should adjust cursor to be within editable region', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(5)  // Initially set cursor
        .withEditableRegion(10, 30);  // Region doesn't include cursor
      
      const example = builder.withFormat(FIMFormat.ZED).build();
      ok(example.cursorPosition >= 10, 'Cursor should be moved into editable region');
      ok(example.cursorPosition <= 30, 'Cursor should be within editable region');
    });
  });

  describe('ZED Format', () => {
    test('should build ZED format example correctly', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(21)  // After "function greet(name)"
        .withEditableRegion(0, sampleCode.length - 1)
        .withFormat(FIMFormat.ZED)
        .withMetadata(sampleEditPair);
      
      const example = builder.build();
      
      equal(example.format, FIMFormat.ZED, 'Format should be ZED');
      ok(example.prompt.includes('<|editable_region_start|>'), 'Prompt should have region start token');
      ok(example.prompt.includes('<|user_cursor_is_here|>'), 'Prompt should have cursor token');
      ok(example.context.includes('<|editable_region_end|>'), 'Context should have region end token');
      equal(example.cursorPosition, 21, 'Cursor position should be preserved');
      deepEqual(example.editableRegion, [0, sampleCode.length - 1], 'Editable region should be preserved');
      equal(example.metadata.filepath, 'test.js', 'Metadata should be preserved');
    });

    test('should place tokens correctly in ZED format', () => {
      const code = 'ABC';
      const builder = new FIMExampleBuilder()
        .withCode(code)
        .withCursor(1)  // After 'A'
        .withEditableRegion(0, 2)  // Inclusive end position (last character index)
        .withFormat(FIMFormat.ZED);
      
      const example = builder.build();
      
      // Prompt should be: <|editable_region_start|>A<|user_cursor_is_here|>
      ok(example.prompt.includes('<|editable_region_start|>A<|user_cursor_is_here|>'), 
         'Tokens should be placed correctly in prompt');
      
      // Completion should be: BC
      equal(example.completion, 'BC', 'Completion should be from cursor to region end');
    });
  });

  describe('PSM Format', () => {
    test('should build PSM format example correctly', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(21)
        .withEditableRegion(0, sampleCode.length - 1)
        .withFormat(FIMFormat.PSM)
        .withMetadata(sampleEditPair);
      
      const example = builder.build();
      
      equal(example.format, FIMFormat.PSM, 'Format should be PSM');
      ok(example.prompt.includes('<|fim_prefix|>'), 'Prompt should have prefix token');
      ok(example.prompt.includes('<|fim_suffix|>'), 'Prompt should have suffix token');
      ok(example.prompt.includes('<|fim_middle|>'), 'Prompt should have middle token');
      
      // Check token order (PSM = Prefix, Suffix, Middle)
      const prefixIndex = example.prompt.indexOf('<|fim_prefix|>');
      const suffixIndex = example.prompt.indexOf('<|fim_suffix|>');
      const middleIndex = example.prompt.indexOf('<|fim_middle|>');
      
      ok(prefixIndex < suffixIndex, 'Prefix should come before suffix');
      ok(suffixIndex < middleIndex, 'Suffix should come before middle');
    });

    test('should limit middle section to 50 characters', () => {
      const longCode = 'a'.repeat(200);
      const builder = new FIMExampleBuilder()
        .withCode(longCode)
        .withCursor(10)
        .withEditableRegion(0, 200)
        .withFormat(FIMFormat.PSM);
      
      const example = builder.build();
      
      ok(example.completion.length <= 50, 'Completion should be limited to 50 characters');
    });
  });

  describe('SPM Format', () => {
    test('should build SPM format example correctly', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(21)
        .withEditableRegion(0, sampleCode.length - 1)
        .withFormat(FIMFormat.SPM)
        .withMetadata(sampleEditPair);
      
      const example = builder.build();
      
      equal(example.format, FIMFormat.SPM, 'Format should be SPM');
      ok(example.prompt.includes('<|fim_suffix|>'), 'Prompt should have suffix token');
      ok(example.prompt.includes('<|fim_prefix|>'), 'Prompt should have prefix token');
      ok(example.prompt.includes('<|fim_middle|>'), 'Prompt should have middle token');
      
      // Check token order (SPM = Suffix, Prefix, Middle)
      const suffixIndex = example.prompt.indexOf('<|fim_suffix|>');
      const prefixIndex = example.prompt.indexOf('<|fim_prefix|>');
      const middleIndex = example.prompt.indexOf('<|fim_middle|>');
      
      ok(suffixIndex < prefixIndex, 'Suffix should come before prefix');
      ok(prefixIndex < middleIndex, 'Prefix should come before middle');
    });
  });

  describe('MIXED Format', () => {
    test('should randomly choose PSM or SPM for MIXED format', () => {
      const formats = new Set();
      
      // Build multiple examples to check randomness
      for (let i = 0; i < 20; i++) {
        const builder = new FIMExampleBuilder()
          .withCode(sampleCode)
          .withCursor(21)
          .withEditableRegion(0, sampleCode.length - 1)
          .withFormat(FIMFormat.MIXED);
        
        const example = builder.build();
        formats.add(example.format);
      }
      
      // Should have both PSM and SPM (statistically very likely with 20 samples)
      ok(formats.has(FIMFormat.PSM) || formats.has(FIMFormat.SPM), 
         'MIXED should produce PSM or SPM format');
    });
  });

  describe('Metadata', () => {
    test('should include metadata in built example', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(21)
        .withEditableRegion(0, sampleCode.length - 1)
        .withFormat(FIMFormat.ZED)
        .withMetadata(sampleEditPair);
      
      const example = builder.build();
      
      equal(example.metadata.filepath, 'test.js', 'Should include filepath');
      equal(example.metadata.commit, 'abc123', 'Should include commit hash');
      equal(example.metadata.language, 'javascript', 'Should include language');
      equal(example.metadata.commitMessage, 'Add greeting function', 'Should include commit message');
    });

    test('should work without metadata', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(21)
        .withEditableRegion(0, sampleCode.length - 1)
        .withFormat(FIMFormat.ZED);
      
      const example = builder.build();
      
      deepEqual(example.metadata, {}, 'Metadata should be empty object');
    });
  });

  describe('Edge Cases', () => {
    test('should handle single character code', () => {
      const builder = new FIMExampleBuilder()
        .withCode('x')
        .withCursor(0)
        .withEditableRegion(0, 0)
        .withFormat(FIMFormat.ZED);
      
      const example = builder.build();
      ok(example, 'Should handle single character code');
    });

    test('should handle cursor at end of code', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(sampleCode.length)  // Cursor after last character
        .withEditableRegion(0, sampleCode.length - 1)
        .withFormat(FIMFormat.ZED);
      
      const example = builder.build();
      equal(example.completion, '', 'Completion should be empty when cursor is at end');
    });

    test('should handle cursor at beginning of code', () => {
      const builder = new FIMExampleBuilder()
        .withCode(sampleCode)
        .withCursor(0)
        .withEditableRegion(0, sampleCode.length - 1)
        .withFormat(FIMFormat.ZED);
      
      const example = builder.build();
      equal(example.prompt.indexOf(sampleCode[0]), -1, 'No code should appear before cursor in prompt');
    });
  });
});