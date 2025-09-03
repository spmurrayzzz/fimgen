import { test, describe } from 'node:test';
import { assert } from './test-helper.js';
import { StringRegionManager, RegionDescriptor } from '../src/utils/string-region-manager.js';

describe('StringRegionManager', () => {
  const sampleCode = `function test() {
    const value = 42;
    return value * 2;
}`;

  describe('constructor', () => {
    test('should handle normal text', () => {
      const manager = new StringRegionManager('hello world');
      assert.equal(manager.length, 11);
      assert.equal(manager.text, 'hello world');
    });

    test('should handle empty text', () => {
      const manager = new StringRegionManager('');
      assert.equal(manager.length, 0);
      assert.equal(manager.text, '');
    });

    test('should handle null/undefined text', () => {
      const manager1 = new StringRegionManager(null);
      assert.equal(manager1.length, 0);
      assert.equal(manager1.text, '');

      const manager2 = new StringRegionManager(undefined);
      assert.equal(manager2.length, 0);
      assert.equal(manager2.text, '');
    });
  });

  describe('extractRegion', () => {
    test('should extract valid region', () => {
      const manager = new StringRegionManager('hello world');
      assert.equal(manager.extractRegion(0, 5), 'hello');
      assert.equal(manager.extractRegion(6, 11), 'world');
    });

    test('should handle out of bounds positions', () => {
      const manager = new StringRegionManager('hello');
      assert.equal(manager.extractRegion(-5, 3), 'hel');
      assert.equal(manager.extractRegion(2, 10), 'llo');
      assert.equal(manager.extractRegion(10, 20), '');
    });

    test('should handle reversed positions', () => {
      const manager = new StringRegionManager('hello');
      assert.equal(manager.extractRegion(3, 1), '');
    });

    test('should extract from multiline text', () => {
      const manager = new StringRegionManager(sampleCode);
      const extracted = manager.extractRegion(17, 34);
      assert(extracted.includes('const value'));
    });
  });

  describe('insertToken', () => {
    test('should insert token at valid position', () => {
      const manager = new StringRegionManager('hello world');
      const result = manager.insertToken(5, ' beautiful');
      
      assert.equal(result.before, 'hello');
      assert.equal(result.after, ' world');
      assert.equal(result.combined, 'hello beautiful world');
    });

    test('should insert token at beginning', () => {
      const manager = new StringRegionManager('world');
      const result = manager.insertToken(0, 'hello ');
      
      assert.equal(result.before, '');
      assert.equal(result.after, 'world');
      assert.equal(result.combined, 'hello world');
    });

    test('should insert token at end', () => {
      const manager = new StringRegionManager('hello');
      const result = manager.insertToken(5, ' world');
      
      assert.equal(result.before, 'hello');
      assert.equal(result.after, '');
      assert.equal(result.combined, 'hello world');
    });

    test('should clamp out of bounds positions', () => {
      const manager = new StringRegionManager('hello');
      
      const result1 = manager.insertToken(-5, 'X');
      assert.equal(result1.combined, 'Xhello');
      
      const result2 = manager.insertToken(10, 'X');
      assert.equal(result2.combined, 'helloX');
    });
  });

  describe('buildWithTokens', () => {
    test('should build string with text and tokens', () => {
      const manager = new StringRegionManager('hello world');
      const result = manager.buildWithTokens([
        { type: 'text', start: 0, end: 5 },
        { type: 'token', token: ' [TOKEN] ' },
        { type: 'text', start: 6, end: 11 }
      ]);
      
      assert.equal(result, 'hello [TOKEN] world');
    });

    test('should handle empty regions array', () => {
      const manager = new StringRegionManager('hello');
      const result = manager.buildWithTokens([]);
      assert.equal(result, '');
    });

    test('should handle only tokens', () => {
      const manager = new StringRegionManager('hello');
      const result = manager.buildWithTokens([
        { type: 'token', token: '<start>' },
        { type: 'token', token: '<end>' }
      ]);
      assert.equal(result, '<start><end>');
    });

    test('should use RegionDescriptor helpers', () => {
      const manager = new StringRegionManager('hello world');
      const result = manager.buildWithTokens([
        RegionDescriptor.text(0, 5),
        RegionDescriptor.token(' <|fim|> '),
        RegionDescriptor.text(6, 11)
      ]);
      
      assert.equal(result, 'hello <|fim|> world');
    });
  });

  describe('getLineContext', () => {
    test('should get context for position in first line', () => {
      const manager = new StringRegionManager(sampleCode);
      const context = manager.getLineContext(10);
      
      assert.equal(context.lineNumber, 0);
      assert.equal(context.lineText, 'function test() {');
      assert.equal(context.positionInLine, 10);
    });

    test('should get context for position in middle line', () => {
      const manager = new StringRegionManager(sampleCode);
      const context = manager.getLineContext(25);
      
      assert.equal(context.lineNumber, 1);
      assert(context.lineText.includes('const value'));
    });

    test('should handle out of bounds positions', () => {
      const manager = new StringRegionManager('hello\nworld');
      
      const context1 = manager.getLineContext(-5);
      assert.equal(context1, null);
      
      const context2 = manager.getLineContext(100);
      assert.equal(context2, null);
    });

    test('should handle single line text', () => {
      const manager = new StringRegionManager('hello world');
      const context = manager.getLineContext(6);
      
      assert.equal(context.lineNumber, 0);
      assert.equal(context.lineText, 'hello world');
      assert.equal(context.positionInLine, 6);
    });
  });

  describe('findBlockBoundaries', () => {
    test('should find block boundaries based on indentation', () => {
      const code = `function outer() {
    function inner() {
        return 42;
    }
    return inner();
}`;
      const manager = new StringRegionManager(code);
      
      // Position inside inner function
      const boundaries = manager.findBlockBoundaries(45);
      const block = manager.extractRegion(boundaries.start, boundaries.end);
      
      assert(block.includes('function inner'));
      assert(block.includes('return 42'));
    });

    test('should handle position at start of text', () => {
      const manager = new StringRegionManager(sampleCode);
      const boundaries = manager.findBlockBoundaries(0);
      
      assert.equal(boundaries.start, 0);
      assert(boundaries.end > 0);
    });

    test('should handle empty lines in block', () => {
      const code = `function test() {
    const a = 1;

    const b = 2;
    return a + b;
}`;
      const manager = new StringRegionManager(code);
      const boundaries = manager.findBlockBoundaries(30);
      const block = manager.extractRegion(boundaries.start, boundaries.end);
      
      assert(block.includes('const a'));
      assert(block.includes('const b'));
    });
  });

  describe('clampPosition and isValidPosition', () => {
    test('should clamp positions to valid range', () => {
      const manager = new StringRegionManager('hello');
      
      assert.equal(manager.clampPosition(-5), 0);
      assert.equal(manager.clampPosition(3), 3);
      assert.equal(manager.clampPosition(10), 5);
    });

    test('should validate positions', () => {
      const manager = new StringRegionManager('hello');
      
      assert.equal(manager.isValidPosition(-1), false);
      assert.equal(manager.isValidPosition(0), true);
      assert.equal(manager.isValidPosition(3), true);
      assert.equal(manager.isValidPosition(5), true);
      assert.equal(manager.isValidPosition(6), false);
    });
  });

  describe('getStatistics', () => {
    test('should return text statistics', () => {
      const manager = new StringRegionManager(sampleCode);
      const stats = manager.getStatistics();
      
      assert.equal(stats.lines, 4);
      assert.equal(stats.nonEmptyLines, 4);
      assert(stats.length > 0);
      assert(stats.averageLineLength > 0);
    });

    test('should handle empty text', () => {
      const manager = new StringRegionManager('');
      const stats = manager.getStatistics();
      
      assert.equal(stats.lines, 1);
      assert.equal(stats.nonEmptyLines, 0);
      assert.equal(stats.length, 0);
      assert.equal(stats.averageLineLength, 0);
    });

    test('should handle text with empty lines', () => {
      const manager = new StringRegionManager('line1\n\nline2\n\n');
      const stats = manager.getStatistics();
      
      assert.equal(stats.lines, 5);
      assert.equal(stats.nonEmptyLines, 2);
    });
  });

  describe('splitAt', () => {
    test('should split text at position', () => {
      const manager = new StringRegionManager('hello world');
      const result = manager.splitAt(6);
      
      assert.equal(result.prefix, 'hello ');
      assert.equal(result.suffix, 'world');
      assert.equal(result.position, 6);
    });

    test('should clamp out of bounds positions', () => {
      const manager = new StringRegionManager('hello');
      
      const result1 = manager.splitAt(-5);
      assert.equal(result1.prefix, '');
      assert.equal(result1.suffix, 'hello');
      assert.equal(result1.position, 0);
      
      const result2 = manager.splitAt(10);
      assert.equal(result2.prefix, 'hello');
      assert.equal(result2.suffix, '');
      assert.equal(result2.position, 5);
    });
  });

  describe('createSubregion', () => {
    test('should create new manager for subregion', () => {
      const manager = new StringRegionManager('hello world');
      const subregion = manager.createSubregion(6, 11);
      
      assert.equal(subregion.text, 'world');
      assert.equal(subregion.length, 5);
    });

    test('should handle out of bounds', () => {
      const manager = new StringRegionManager('hello');
      const subregion = manager.createSubregion(2, 10);
      
      assert.equal(subregion.text, 'llo');
      assert.equal(subregion.length, 3);
    });
  });

  describe('edge cases', () => {
    test('should handle text with only newlines', () => {
      const manager = new StringRegionManager('\n\n\n');
      const stats = manager.getStatistics();
      
      assert.equal(stats.lines, 4);
      assert.equal(stats.nonEmptyLines, 0);
    });

    test('should handle very long lines', () => {
      const longLine = 'x'.repeat(1000);
      const manager = new StringRegionManager(longLine);
      const middle = manager.extractRegion(400, 600);
      
      assert.equal(middle.length, 200);
      assert.equal(middle, 'x'.repeat(200));
    });

    test('should handle unicode characters', () => {
      const manager = new StringRegionManager('hello 👋 world 🌍');
      const emoji = manager.extractRegion(6, 8);
      assert.equal(emoji, '👋');
    });

    test('should handle Windows line endings', () => {
      const manager = new StringRegionManager('line1\r\nline2\r\nline3');
      const stats = manager.getStatistics();
      
      // Note: split('\n') will keep \r characters
      assert.equal(stats.lines, 3);
    });
  });
});