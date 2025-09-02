import { test, describe, beforeEach } from 'node:test';
import { assert, createMockFIMExample } from './test-helper.js';
import { NegativeExampleGenerator } from '../src/negative-example-generator.js';

describe('NegativeExampleGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new NegativeExampleGenerator();
  });

  test('should create instance', () => {
    assert(generator instanceof NegativeExampleGenerator);
  });

  describe('generateNegativeExamples', () => {
    test('should generate negative examples from positive ones', () => {
      const positiveExamples = [
        createMockFIMExample(),
        createMockFIMExample({ completion: 'return true;' })
      ];

      const negativeExamples = generator.generateNegativeExamples(positiveExamples);
      
      assert(Array.isArray(negativeExamples));
      assert(negativeExamples.length > 0);
      
      negativeExamples.forEach(ex => {
        assert.equal(ex.label, false);
        assert(ex.metadata.degradationMethod);
      });
    });

    test('should preserve prompt from original example', () => {
      const positive = createMockFIMExample({ prompt: 'test prompt' });
      const negatives = generator.generateNegativeExamples([positive]);
      
      if (negatives.length > 0) {
        assert.equal(negatives[0].prompt, 'test prompt');
      }
    });

    test('should add degradation method to metadata', () => {
      const positive = createMockFIMExample();
      const negatives = generator.generateNegativeExamples([positive]);
      
      negatives.forEach(ex => {
        assert(ex.metadata.degradationMethod);
        assert(['subtle_bugs', 'incomplete', 'wrong_variable', 'off_by_one', 'type_errors']
          .includes(ex.metadata.degradationMethod));
      });
    });

    test('should handle empty input', () => {
      const negatives = generator.generateNegativeExamples([]);
      assert(Array.isArray(negatives));
      assert.equal(negatives.length, 0);
    });
  });

  describe('_chooseDegradationMethod', () => {
    test('should return valid degradation method', () => {
      const validMethods = ['subtle_bugs', 'incomplete', 'wrong_variable', 'off_by_one', 'type_errors'];
      
      for (let i = 0; i < 10; i++) {
        const method = generator._chooseDegradationMethod();
        assert(validMethods.includes(method));
      }
    });

    test('should use weighted selection', () => {
      const methods = {};
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        const method = generator._chooseDegradationMethod();
        methods[method] = (methods[method] || 0) + 1;
      }
      
      // subtle_bugs should be selected more often (weight 0.3)
      assert(methods.subtle_bugs > methods.type_errors);
    });
  });

  describe('_applyDegradation', () => {
    test('should handle empty code', () => {
      const result = generator._applyDegradation('', 'subtle_bugs', 'python');
      assert.equal(result, '');
    });

    test('should handle null/undefined code', () => {
      const result1 = generator._applyDegradation(null, 'subtle_bugs', 'python');
      assert.equal(result1, null);
      
      const result2 = generator._applyDegradation(undefined, 'subtle_bugs', 'python');
      assert.equal(result2, undefined);
    });

    test('should apply each degradation method', () => {
      const code = 'function test() { return x == 1 && y > 0; }';
      
      const methods = ['subtle_bugs', 'incomplete', 'wrong_variable', 'off_by_one', 'type_errors'];
      methods.forEach(method => {
        const result = generator._applyDegradation(code, method, 'javascript');
        assert(typeof result === 'string');
      });
    });

    test('should handle unknown degradation method', () => {
      const code = 'test code';
      const result = generator._applyDegradation(code, 'unknown_method', 'python');
      assert.equal(result, code);
    });
  });

  describe('_introduceSubtleBugs', () => {
    test('should modify Python equality operators', () => {
      const code = 'if x == 1: pass';
      const result = generator._introduceSubtleBugs(code, 'python');
      assert(result === code || result === 'if x = 1: pass');
    });

    test('should modify JavaScript equality operators', () => {
      const code = 'if (x === 1) { }';
      const result = generator._introduceSubtleBugs(code, 'javascript');
      assert(result === code || result === 'if (x == 1) { }');
    });

    test('should modify logical operators', () => {
      const code = 'if (a && b) { }';
      const result = generator._introduceSubtleBugs(code, 'javascript');
      assert(result === code || result === 'if (a || b) { }');
    });

    test('should handle code without target patterns', () => {
      const code = 'const x = 1;';
      const result = generator._introduceSubtleBugs(code, 'javascript');
      assert.equal(result, code);
    });
  });

  describe('_makeIncomplete', () => {
    test('should truncate code', () => {
      const code = 'function test() {\n    return 1;\n}';
      const result = generator._makeIncomplete(code);
      assert(result.length < code.length);
      assert(code.startsWith(result));
    });

    test('should handle single line code', () => {
      const code = 'const x = 1;';
      const result = generator._makeIncomplete(code);
      assert(result.length <= code.length);
    });

    test('should cut at reasonable points', () => {
      const code = 'line1\nline2\nline3\nline4\nline5';
      const result = generator._makeIncomplete(code);
      assert(result.length < code.length);
    });

    test('should handle empty code', () => {
      const result = generator._makeIncomplete('');
      assert.equal(result, '');
    });
  });

  describe('_useWrongVariable', () => {
    test('should swap Python variables', () => {
      const code = 'x = 1\ny = 2\nresult = x + y';
      const result = generator._useWrongVariable(code, 'python');
      
      // Should either keep original or swap a variable
      assert(typeof result === 'string');
      assert(result.length > 0);
    });

    test('should swap JavaScript variables', () => {
      const code = 'const foo = 1;\nconst bar = 2;\nreturn foo + bar;';
      const result = generator._useWrongVariable(code, 'javascript');
      
      assert(typeof result === 'string');
      assert(result.length > 0);
    });

    test('should handle code with single variable', () => {
      const code = 'x = 1';
      const result = generator._useWrongVariable(code, 'python');
      assert.equal(result, code);
    });

    test('should handle code with no variables', () => {
      const code = '1 + 2';
      const result = generator._useWrongVariable(code, 'python');
      assert.equal(result, code);
    });
  });

  describe('_introduceOffByOne', () => {
    test('should modify numbers', () => {
      const code = 'for i in range(10):';
      const result = generator._introduceOffByOne(code);
      
      // Might change 10 to 11 or keep it the same
      assert(result === code || result.includes('11'));
    });

    test('should modify comparison operators', () => {
      const code = 'if (x <= 10) { }';
      const result = generator._introduceOffByOne(code);
      
      assert(result === code || result === 'if (x < 10) { }');
    });

    test('should handle code without numbers', () => {
      const code = 'const x = y;';
      const result = generator._introduceOffByOne(code);
      assert(typeof result === 'string');
    });
  });

  describe('_introduceTypeErrors', () => {
    test('should modify Python type conversions', () => {
      const code = 'x = str(value)';
      const result = generator._introduceTypeErrors(code, 'python');
      
      assert(result === code || result === 'x = int(value)');
    });

    test('should modify JavaScript type conversions', () => {
      const code = 'const x = parseInt(value);';
      const result = generator._introduceTypeErrors(code, 'javascript');
      
      assert(result === code || result === 'const x = parseFloat(value);');
    });

    test('should modify brackets', () => {
      const code = 'const arr = [];';
      const result = generator._introduceTypeErrors(code, 'javascript');
      
      assert(result === code || result === 'const arr = {};');
    });

    test('should handle code without type patterns', () => {
      const code = 'x = 1';
      const result = generator._introduceTypeErrors(code, 'python');
      assert.equal(result, code);
    });
  });

  describe('configuration', () => {
    test('should have degradation weights', () => {
      assert(generator.degradationWeights);
      assert.equal(generator.degradationWeights.subtle_bugs, 0.3);
      assert.equal(generator.degradationWeights.incomplete, 0.25);
      assert.equal(generator.degradationWeights.wrong_variable, 0.2);
      assert.equal(generator.degradationWeights.off_by_one, 0.15);
      assert.equal(generator.degradationWeights.type_errors, 0.1);
    });

    test('weights should sum to 1', () => {
      const sum = Object.values(generator.degradationWeights)
        .reduce((acc, val) => acc + val, 0);
      assert.equal(sum, 1);
    });
  });
});