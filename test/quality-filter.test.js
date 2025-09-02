import { test, describe, beforeEach } from 'node:test';
import { assert, sampleCode } from './test-helper.js';
import { QualityFilter } from '../src/quality-filter.js';

describe('QualityFilter', () => {
  let filter;

  beforeEach(() => {
    filter = new QualityFilter();
  });

  test('should create instance', () => {
    assert(filter instanceof QualityFilter);
  });

  describe('passesQualityChecks', () => {
    test('should accept valid Python code', () => {
      const result = filter.passesQualityChecks(sampleCode.python, 'python');
      assert.equal(result, true);
    });

    test('should accept valid JavaScript code', () => {
      const result = filter.passesQualityChecks(sampleCode.javascript, 'javascript');
      assert.equal(result, true);
    });

    test('should accept valid Java code', () => {
      const result = filter.passesQualityChecks(sampleCode.java, 'java');
      assert.equal(result, true);
    });

    test('should reject empty code', () => {
      assert.equal(filter.passesQualityChecks('', 'python'), false);
      assert.equal(filter.passesQualityChecks('   ', 'javascript'), false);
      assert.equal(filter.passesQualityChecks('\n\n', 'java'), false);
    });

    test('should reject code that is too short', () => {
      const result = filter.passesQualityChecks(sampleCode.tooShort, 'python');
      assert.equal(result, false);
    });

    test('should reject code that is too long', () => {
      const longCode = 'x = 1\n'.repeat(50000);
      const result = filter.passesQualityChecks(longCode, 'python');
      assert.equal(result, false);
    });

    test('should reject code with merge conflicts', () => {
      const result = filter.passesQualityChecks(sampleCode.mergeConflict, 'javascript');
      assert.equal(result, false);
    });

    test('should reject generated code', () => {
      const result = filter.passesQualityChecks(sampleCode.generatedCode, 'javascript');
      assert.equal(result, false);
    });

    test('should reject code with AUTO-GENERATED marker', () => {
      const code = '// AUTO-GENERATED\nfunction test() { return 1; }';
      assert.equal(filter.passesQualityChecks(code, 'javascript'), false);
    });

    test('should reject code with DO NOT EDIT marker', () => {
      const code = '# DO NOT EDIT\ndef test(): return 1';
      assert.equal(filter.passesQualityChecks(code, 'python'), false);
    });

    test('should handle null/undefined gracefully', () => {
      assert.equal(filter.passesQualityChecks(null, 'python'), false);
      assert.equal(filter.passesQualityChecks(undefined, 'javascript'), false);
    });

    test('should handle unknown language', () => {
      const code = 'function test() { return 1; }';
      const result = filter.passesQualityChecks(code, 'unknown');
      assert.equal(result, true);
    });
  });

  describe('_checkCommentRatio', () => {
    test('should accept code with reasonable comments', () => {
      const code = `// Helper function
function test() {
    return 1; // Return value
}`;
      const result = filter._checkCommentRatio(code, 'javascript');
      assert.equal(result, true);
    });

    test('should reject code with too many comments', () => {
      const code = `// Comment 1
// Comment 2
// Comment 3
// Comment 4
// Comment 5
// Comment 6
function test() { return 1; }`;
      const result = filter._checkCommentRatio(code, 'javascript');
      assert.equal(result, false);
    });

    test('should handle Python comments', () => {
      const code = `# This is a comment
def test():
    """Docstring"""
    return 1  # inline comment`;
      const result = filter._checkCommentRatio(code, 'python');
      assert.equal(result, true);
    });

    test('should handle Java/C++ style comments', () => {
      const code = `/* Multi-line
   comment */
// Single line
int main() {
    return 0; // inline
}`;
      const result = filter._checkCommentRatio(code, 'cpp');
      assert.equal(result, true);
    });

    test('should handle empty code', () => {
      const result = filter._checkCommentRatio('', 'python');
      assert.equal(result, false);
    });
  });

  describe('_hasValidSyntaxPatterns', () => {
    test('should validate Python syntax patterns', () => {
      assert.equal(filter._hasValidSyntaxPatterns('def test(): pass', 'python'), true);
      assert.equal(filter._hasValidSyntaxPatterns('class Test: pass', 'python'), true);
      assert.equal(filter._hasValidSyntaxPatterns('import os', 'python'), true);
      assert.equal(filter._hasValidSyntaxPatterns('x = 1', 'python'), true);
    });

    test('should validate JavaScript syntax patterns', () => {
      assert.equal(filter._hasValidSyntaxPatterns('function test() {}', 'javascript'), true);
      assert.equal(filter._hasValidSyntaxPatterns('const x = 1', 'javascript'), true);
      assert.equal(filter._hasValidSyntaxPatterns('let y = 2', 'javascript'), true);
      assert.equal(filter._hasValidSyntaxPatterns('var z = 3', 'javascript'), true);
      assert.equal(filter._hasValidSyntaxPatterns('() => {}', 'javascript'), true);
    });

    test('should detect unbalanced brackets', () => {
      const code = 'function test() { { { { {';
      const result = filter._hasValidSyntaxPatterns(code, 'javascript');
      assert.equal(result, false);
    });

    test('should allow some bracket imbalance', () => {
      const code = 'function test() { return {a: 1}';
      const result = filter._hasValidSyntaxPatterns(code, 'javascript');
      assert.equal(result, true);
    });

    test('should validate generic patterns', () => {
      const code = 'myVariable = getValue()';
      const result = filter._hasValidSyntaxPatterns(code, 'unknown');
      assert.equal(result, true);
    });
  });

  describe('isSemanticChange', () => {
    test('should detect semantic changes', () => {
      const result = filter.isSemanticChange(sampleCode.semanticDiff);
      assert.equal(result, true);
    });

    test('should reject whitespace-only changes', () => {
      const result = filter.isSemanticChange(sampleCode.whitespaceDiff);
      assert.equal(result, false);
    });

    test('should detect valid code changes', () => {
      const diff = `@@ -1,3 +1,3 @@
 function test() {
-    return 1;
+    return 2;
 }`;
      const result = filter.isSemanticChange(diff);
      assert.equal(result, true);
    });

    test('should handle empty diff', () => {
      assert.equal(filter.isSemanticChange(''), false);
      assert.equal(filter.isSemanticChange(null), false);
      assert.equal(filter.isSemanticChange(undefined), false);
    });

    test('should handle diff with no changes', () => {
      const diff = `@@ -1,3 +1,3 @@
 function test() {
     return 1;
 }`;
      const result = filter.isSemanticChange(diff);
      assert.equal(result, false);
    });

    test('should detect addition of new lines', () => {
      const diff = `@@ -1,3 +1,4 @@
 function test() {
     return 1;
+    console.log("test");
 }`;
      const result = filter.isSemanticChange(diff);
      assert.equal(result, true);
    });

    test('should detect removal of lines', () => {
      const diff = `@@ -1,4 +1,3 @@
 function test() {
     return 1;
-    console.log("test");
 }`;
      const result = filter.isSemanticChange(diff);
      assert.equal(result, true);
    });

    test('should handle malformed diff gracefully', () => {
      const diff = 'not a valid diff';
      const result = filter.isSemanticChange(diff);
      assert.equal(result, false);
    });
  });

  describe('configuration', () => {
    test('should have correct default values', () => {
      assert.equal(filter.MIN_CODE_LENGTH, 10);
      assert.equal(filter.MAX_CODE_LENGTH, 100000);
      assert.equal(filter.MAX_COMMENT_RATIO, 0.5);
      assert.equal(filter.MIN_DIFF_CHANGES, 1);
    });

    test('should have generated patterns', () => {
      assert(Array.isArray(filter.generatedPatterns));
      assert(filter.generatedPatterns.length > 0);
      assert(filter.generatedPatterns.every(p => p instanceof RegExp));
    });
  });
});