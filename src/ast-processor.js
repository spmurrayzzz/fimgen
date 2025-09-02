export class ASTProcessor {
  constructor() {
    this.parsers = new Map();
    this.hasTreeSitter = false;
    
    this.priorityNodes = {
      python: ['if_statement', 'function_definition', 'call', 'assignment', 'for_statement', 'while_statement'],
      javascript: ['if_statement', 'function_declaration', 'call_expression', 'assignment_expression', 'for_statement'],
      typescript: ['if_statement', 'function_declaration', 'call_expression', 'assignment_expression', 'for_statement'],
      java: ['if_statement', 'method_declaration', 'method_invocation', 'assignment', 'for_statement'],
      cpp: ['if_statement', 'function_definition', 'call_expression', 'assignment_expression', 'for_statement'],
      c: ['if_statement', 'function_definition', 'call_expression', 'assignment_expression', 'for_statement']
    };
  }

  selectCursorPositions(code, _language, numPositions = 3) {
    // For now, always use fallback until tree-sitter parsers are properly configured
    return this._fallbackCursorSelection(code, numPositions);
  }

  _fallbackCursorSelection(code, numPositions) {
    if (!code) return [0];

    const lines = code.split('\n');
    const positions = [];
    let currentPos = 0;

    for (const line of lines) {
      const lineEnd = currentPos + line.length;
      const stripped = line.trim();

      if (stripped && !stripped.startsWith('#') && !stripped.startsWith('//')) {
        if (line.includes(':')) {
          const pos = currentPos + line.indexOf(':') + 1;
          positions.push(Math.min(pos, code.length - 1));
        } else if (line.includes(';')) {
          const pos = currentPos + line.indexOf(';') + 1;
          positions.push(Math.min(pos, code.length - 1));
        } else if (line.includes('{')) {
          const pos = currentPos + line.indexOf('{') + 1;
          positions.push(Math.min(pos, code.length - 1));
        } else {
          positions.push(Math.min(lineEnd, code.length - 1));
        }
      }

      currentPos = lineEnd + 1;
    }

    let uniquePositions = [...new Set(positions)].filter(p => p >= 0 && p < code.length);

    if (!uniquePositions.length) {
      const step = Math.max(1, Math.floor(code.length / (numPositions + 1)));
      for (let i = 1; i <= numPositions; i++) {
        uniquePositions.push(Math.min(i * step, code.length - 1));
      }
    }

    // If we don't have enough positions, add evenly spaced ones
    if (uniquePositions.length < numPositions) {
      const step = Math.max(1, Math.floor(code.length / (numPositions + 1)));
      const additionalPositions = new Set(uniquePositions);
      
      for (let i = 1; i <= numPositions && additionalPositions.size < numPositions; i++) {
        const pos = Math.min(i * step, code.length - 1);
        additionalPositions.add(pos);
      }
      
      // If still not enough, add random positions
      let attempts = 0;
      while (additionalPositions.size < numPositions && attempts < 100) {
        const randomPos = Math.floor(Math.random() * code.length);
        additionalPositions.add(randomPos);
        attempts++;
      }
      
      uniquePositions = Array.from(additionalPositions);
    }

    if (uniquePositions.length > numPositions) {
      const shuffled = uniquePositions.sort(() => Math.random() - 0.5);
      return shuffled.slice(0, numPositions).sort((a, b) => a - b);
    }

    return uniquePositions.sort((a, b) => a - b);
  }
}