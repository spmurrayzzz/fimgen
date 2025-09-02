import { test, describe, beforeEach } from 'node:test';
import { assert, sampleCode } from './test-helper.js';
import { ASTProcessor } from '../src/ast-processor.js';

describe('ASTProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new ASTProcessor();
  });

  test('should create instance', () => {
    assert(processor instanceof ASTProcessor);
  });

  describe('selectCursorPositions', () => {
    test('should return positions for Python code', () => {
      const positions = processor.selectCursorPositions(sampleCode.python, 'python', 3);
      assert(Array.isArray(positions));
      assert.equal(positions.length, 3);
      positions.forEach(pos => {
        assert(pos >= 0);
        assert(pos < sampleCode.python.length);
      });
    });

    test('should return positions for JavaScript code', () => {
      const positions = processor.selectCursorPositions(sampleCode.javascript, 'javascript', 3);
      assert(Array.isArray(positions));
      assert.equal(positions.length, 3);
      positions.forEach(pos => {
        assert(pos >= 0);
        assert(pos < sampleCode.javascript.length);
      });
    });

    test('should return sorted positions', () => {
      const positions = processor.selectCursorPositions(sampleCode.python, 'python', 5);
      for (let i = 1; i < positions.length; i++) {
        assert(positions[i] >= positions[i - 1]);
      }
    });

    test('should handle empty code', () => {
      const positions = processor.selectCursorPositions('', 'python', 3);
      assert(Array.isArray(positions));
      assert.equal(positions[0], 0);
    });

    test('should handle single line code', () => {
      const code = 'const x = 42;';
      const positions = processor.selectCursorPositions(code, 'javascript', 3);
      assert(Array.isArray(positions));
      positions.forEach(pos => {
        assert(pos >= 0);
        assert(pos < code.length);
      });
    });

    test('should respect numPositions parameter', () => {
      const positions1 = processor.selectCursorPositions(sampleCode.python, 'python', 1);
      const positions5 = processor.selectCursorPositions(sampleCode.python, 'python', 5);
      const positions10 = processor.selectCursorPositions(sampleCode.python, 'python', 10);
      
      assert.equal(positions1.length, 1);
      assert.equal(positions5.length, 5);
      assert.equal(positions10.length, 10);
    });

    test('should handle unknown language', () => {
      const positions = processor.selectCursorPositions(sampleCode.javascript, 'unknown', 3);
      assert(Array.isArray(positions));
      assert(positions.length > 0);
    });
  });

  describe('_fallbackCursorSelection', () => {
    test('should find positions after colons in Python', () => {
      const code = 'def test():\n    return 1';
      const positions = processor._fallbackCursorSelection(code, 3);
      assert(positions.some(pos => code[pos - 1] === ':'));
    });

    test('should find positions after semicolons in JavaScript', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const positions = processor._fallbackCursorSelection(code, 3);
      assert(positions.some(pos => code[pos - 1] === ';'));
    });

    test('should find positions after opening braces', () => {
      const code = 'function test() {\n    return 1;\n}';
      const positions = processor._fallbackCursorSelection(code, 3);
      assert(positions.some(pos => code[pos - 1] === '{'));
    });

    test('should skip comment lines', () => {
      const code = '// comment\nconst x = 1;\n# another comment\nconst y = 2;';
      const positions = processor._fallbackCursorSelection(code, 2);
      positions.forEach(pos => {
        const lineStart = code.lastIndexOf('\n', pos - 1) + 1;
        const line = code.substring(lineStart, code.indexOf('\n', pos) === -1 ? code.length : code.indexOf('\n', pos));
        assert(!line.trim().startsWith('//'));
        assert(!line.trim().startsWith('#'));
      });
    });

    test('should handle code with no special characters', () => {
      const code = 'x = 1\ny = 2\nz = 3';
      const positions = processor._fallbackCursorSelection(code, 3);
      assert(Array.isArray(positions));
      assert(positions.length > 0);
    });

    test('should return evenly spaced positions for simple code', () => {
      const code = 'abcdefghijklmnopqrstuvwxyz';
      const positions = processor._fallbackCursorSelection(code, 3);
      assert.equal(positions.length, 3);
      
      // Check positions are somewhat evenly distributed
      const spacing1 = positions[1] - positions[0];
      const spacing2 = positions[2] - positions[1];
      assert(Math.abs(spacing1 - spacing2) < code.length / 2);
    });

    test('should handle very short code', () => {
      const code = 'x';
      const positions = processor._fallbackCursorSelection(code, 3);
      assert(Array.isArray(positions));
      positions.forEach(pos => {
        assert(pos >= 0);
        assert(pos < code.length);
      });
    });

    test('should return unique positions', () => {
      const code = 'const x = 1;\nconst y = 2;\nconst z = 3;';
      const positions = processor._fallbackCursorSelection(code, 5);
      const uniquePositions = [...new Set(positions)];
      assert.equal(positions.length, uniquePositions.length);
    });
  });

  describe('configuration', () => {
    test('should have priority nodes defined', () => {
      assert(processor.priorityNodes);
      assert(processor.priorityNodes.python);
      assert(processor.priorityNodes.javascript);
      assert(processor.priorityNodes.typescript);
      assert(processor.priorityNodes.java);
      assert(processor.priorityNodes.cpp);
      assert(processor.priorityNodes.c);
    });

    test('should have expected priority node types', () => {
      assert(processor.priorityNodes.python.includes('if_statement'));
      assert(processor.priorityNodes.python.includes('function_definition'));
      assert(processor.priorityNodes.javascript.includes('function_declaration'));
      assert(processor.priorityNodes.javascript.includes('call_expression'));
    });

    test('should have hasTreeSitter flag', () => {
      assert.equal(typeof processor.hasTreeSitter, 'boolean');
      assert.equal(processor.hasTreeSitter, false); // Should be false since we're using fallback
    });
  });
});