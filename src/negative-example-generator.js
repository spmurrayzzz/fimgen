import { KTOExample } from './types.js';

export class NegativeExampleGenerator {
  constructor() {
    this.degradationWeights = {
      'subtle_bugs': 0.3,
      'incomplete': 0.25,
      'wrong_variable': 0.2,
      'off_by_one': 0.15,
      'type_errors': 0.1
    };
  }

  generateNegativeExamples(positiveExamples) {
    const negativeExamples = [];

    for (const example of positiveExamples) {
      // Try multiple degradation methods until we get a different result
      const methods = Object.keys(this.degradationWeights);
      let degradedCompletion = null;
      let usedMethod = null;

      for (const method of methods) {
        try {
          const degraded = this._applyDegradation(
            example.completion,
            method,
            example.metadata?.language || 'javascript'
          );

          if (degraded && degraded !== example.completion) {
            degradedCompletion = degraded;
            usedMethod = method;
            break;
          }
        } catch (error) {
          // console.debug('Failed with method', method, ':', error.message);
        }
      }

      // If no method worked, force a simple degradation
      // TODO: this likely will be redundant if we use LLM-drive synthetic negatives
      if (!degradedCompletion || degradedCompletion === example.completion) {
        if (example.completion && example.completion.length > 0) {
          // For very short completions, use different strategies
          if (example.completion.length <= 5) {
            // For very short completions, add garbage or remove entirely
            if (example.completion.trim()) {
              // Always use a non-empty degradation for non-empty completions
              // This ensures deterministic behavior and avoids empty string issues
              degradedCompletion = 'undefined';
              usedMethod = 'corruption';
            }
          } else {
            // Simple truncation as fallback for longer completions
            degradedCompletion = example.completion.substring(0, Math.floor(example.completion.length * 0.7));
            usedMethod = 'incomplete';
          }
        }
      }

      if (degradedCompletion !== undefined && degradedCompletion !== example.completion) {
        negativeExamples.push(new KTOExample({
          prompt: example.prompt,
          completion: degradedCompletion,
          label: false,
          metadata: {
            ...example.metadata,
            degradationMethod: usedMethod
          }
        }));
      }
    }

    return negativeExamples;
  }

  _chooseDegradationMethod() {
    const methods = Object.keys(this.degradationWeights);
    const weights = Object.values(this.degradationWeights);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let random = Math.random() * totalWeight;

    for (let i = 0; i < methods.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return methods[i];
      }
    }

    return methods[methods.length - 1];
  }

  _applyDegradation(code, method, language) {
    if (!code) return code;

    try {
      switch (method) {
        case 'subtle_bugs':
          return this._introduceSubtleBugs(code, language);
        case 'incomplete':
          return this._makeIncomplete(code);
        case 'wrong_variable':
          return this._useWrongVariable(code, language);
        case 'off_by_one':
          return this._introduceOffByOne(code);
        case 'type_errors':
          return this._introduceTypeErrors(code, language);
        default:
          return code;
      }
    } catch {
      return code;
    }
  }

  _introduceSubtleBugs(code, language) {
    let replacements = [];

    if (language === 'python') {
      replacements = [
        ['==', '='],
        [' is ', ' == '],
        [' and ', ' or '],
        ['range(len(', 'range(1, len('],
        ['.append(', '.extend(']
      ];
    } else if (language === 'javascript' || language === 'typescript') {
      replacements = [
        ['===', '=='],
        ['!==', '!='],
        ['let ', 'var '],
        ['.push(', '.concat('],
        ['&&', '||']
      ];
    } else {
      replacements = [
        ['++', '--'],
        ['&&', '||'],
        ['<=', '<'],
        ['>=', '>']
      ];
    }

    let degraded = code;
    if (replacements.length > 0) {
      const [old, replacement] = replacements[Math.floor(Math.random() * replacements.length)];
      const idx = degraded.indexOf(old);
      if (idx !== -1) {
        degraded = degraded.substring(0, idx) + replacement + degraded.substring(idx + old.length);
      }
    }

    return degraded;
  }

  _makeIncomplete(code) {
    if (!code) return code;

    const cutPoint = Math.floor((60 + Math.random() * 20) * code.length / 100);
    let incomplete = code.substring(0, cutPoint);

    const lastNewline = incomplete.lastIndexOf('\n');
    if (lastNewline > cutPoint - 20) {
      incomplete = incomplete.substring(0, lastNewline);
    }

    return incomplete;
  }

  _useWrongVariable(code, language) {
    let pattern;
    if (language === 'python') {
      pattern = /\b([a-z_][a-z0-9_]*)\b/g;
    } else {
      pattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    }

    const matches = [...code.matchAll(pattern)];
    const variables = [...new Set(matches.map(m => m[1]))];

    if (variables.length > 1) {
      const var1 = variables[Math.floor(Math.random() * variables.length)];
      let var2 = variables[Math.floor(Math.random() * variables.length)];

      while (var2 === var1 && variables.length > 1) {
        var2 = variables[Math.floor(Math.random() * variables.length)];
      }

      if (var1 !== var2) {
        const regex = new RegExp(`\\b${var1}\\b`);
        return code.replace(regex, var2);
      }
    }

    return code;
  }

  _introduceOffByOne(code) {
    const patterns = [
      {
        pattern: /<=/,
        replacement: '<'
      },
      {
        pattern: />=/,
        replacement: '>'
      },
      {
        pattern: /\b(\d+)\b/,
        replacement: (match) => String(parseInt(match) + 1)
      },
      {
        pattern: /range\((\d+)\)/,
        replacement: (_match, num) => `range(${parseInt(num) + 1})`
      }
    ];

    // Try patterns in order, use first one that matches
    for (const { pattern, replacement } of patterns) {
      if (code.match(pattern)) {
        if (typeof replacement === 'string') {
          const idx = code.search(pattern);
          if (idx !== -1) {
            const matchResult = code.match(pattern);
            return code.substring(0, idx) + replacement + code.substring(idx + matchResult[0].length);
          }
        } else {
          return code.replace(pattern, replacement);
        }
      }
    }

    return code;
  }

  _introduceTypeErrors(code, language) {
    let replacements = [];

    if (language === 'python') {
      replacements = [
        ['\'', '"'],
        ['str(', 'int('],
        ['int(', 'str('],
        ['.split()', '.strip()'],
        ['[]', '{}']
      ];
    } else if (language === 'javascript' || language === 'typescript') {
      replacements = [
        ['toString()', 'toNumber()'],
        ['parseInt(', 'parseFloat('],
        ['[]', '{}'],
        ['\'', '`']
      ];
    } else {
      replacements = [
        ['int', 'float'],
        ['float', 'int'],
        ['[]', '{}']
      ];
    }

    if (replacements.length > 0) {
      const [old, replacement] = replacements[Math.floor(Math.random() * replacements.length)];
      const idx = code.indexOf(old);
      if (idx !== -1) {
        return code.substring(0, idx) + replacement + code.substring(idx + old.length);
      }
    }

    return code;
  }
}
