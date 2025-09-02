import { FIMExample, FIMFormat } from './types.js';
import { ASTProcessor } from './ast-processor.js';

export class FIMTransformer {
  constructor() {
    this.astProcessor = new ASTProcessor();
  }

  createFIMExamples(editPair, format = FIMFormat.ZED, numExamples = 3) {
    const examples = [];
    const code = editPair.after;

    if (!code) return examples;

    try {
      const cursorPositions = this.astProcessor.selectCursorPositions(
        code, 
        editPair.language, 
        numExamples
      );

      for (const cursorPos of cursorPositions) {
        const validCursorPos = Math.max(0, Math.min(cursorPos, code.length - 1));
        const editableRegion = this._determineEditableRegion(code, validCursorPos);

        let example = null;

        if (format === FIMFormat.ZED) {
          example = this._createZedFormatExample(code, validCursorPos, editableRegion, editPair);
        } else if (format === FIMFormat.PSM) {
          example = this._createPSMFormatExample(code, validCursorPos, editableRegion, editPair);
        } else if (format === FIMFormat.SPM) {
          example = this._createSPMFormatExample(code, validCursorPos, editableRegion, editPair);
        } else if (format === FIMFormat.MIXED) {
          if (Math.random() < 0.5) {
            example = this._createPSMFormatExample(code, validCursorPos, editableRegion, editPair);
          } else {
            example = this._createSPMFormatExample(code, validCursorPos, editableRegion, editPair);
          }
        }

        if (example) {
          examples.push(example);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') console.warn('Failed to create FIM examples:', error.message);
    }

    return examples;
  }

  _determineEditableRegion(code, cursorPos) {
    if (!code) return [0, 0];

    cursorPos = Math.max(0, Math.min(cursorPos, code.length - 1));

    const lines = code.split('\n');
    if (!lines.length) return [0, code.length];

    let currentPos = 0;
    let cursorLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineEnd = currentPos + lines[i].length;
      if (currentPos <= cursorPos && cursorPos <= lineEnd) {
        cursorLine = i;
        break;
      }
      currentPos = lineEnd + 1;
    }

    const startLine = this._findBlockStart(lines, cursorLine);
    const endLine = this._findBlockEnd(lines, cursorLine);

    let startPos = 0;
    for (let i = 0; i < startLine; i++) {
      startPos += lines[i].length + 1;
    }

    let endPos = startPos;
    for (let i = startLine; i <= Math.min(endLine, lines.length - 1); i++) {
      endPos += lines[i].length + 1;
    }

    startPos = Math.max(0, startPos);
    endPos = Math.min(code.length, endPos);

    if (cursorPos < startPos) {
      startPos = Math.max(0, cursorPos - 50);
    }
    if (cursorPos > endPos) {
      endPos = Math.min(code.length, cursorPos + 50);
    }

    return [startPos, endPos];
  }

  _findBlockStart(lines, currentLine) {
    if (!lines.length || currentLine >= lines.length) return 0;

    const currentIndent = lines[currentLine].length - lines[currentLine].trimStart().length;

    for (let i = currentLine - 1; i >= 0; i--) {
      if (lines[i].trim()) {
        const lineIndent = lines[i].length - lines[i].trimStart().length;
        if (lineIndent < currentIndent) {
          return i + 1;
        }
      }
    }

    return 0;
  }

  _findBlockEnd(lines, currentLine) {
    if (!lines.length || currentLine >= lines.length) return lines.length - 1;

    const currentIndent = lines[currentLine].length - lines[currentLine].trimStart().length;

    for (let i = currentLine + 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const lineIndent = lines[i].length - lines[i].trimStart().length;
        if (lineIndent < currentIndent) {
          return i - 1;
        }
      }
    }

    return lines.length - 1;
  }

  _createZedFormatExample(code, cursorPos, editableRegion, editPair) {
    try {
      const [start, end] = editableRegion;
      const validStart = Math.max(0, start);
      const validEnd = Math.min(code.length, end);
      const validCursorPos = Math.max(validStart, Math.min(cursorPos, validEnd));

      const inputText = 
        code.substring(0, validStart) +
        '<|editable_region_start|>' +
        code.substring(validStart, validCursorPos) +
        '<|user_cursor_is_here|>';

      const completion = code.substring(validCursorPos, validEnd);

      const context = 
        code.substring(0, validStart) +
        '<|editable_region_start|>' +
        code.substring(validStart, validCursorPos) +
        '<|user_cursor_is_here|>' +
        code.substring(validCursorPos, validEnd) +
        '<|editable_region_end|>' +
        code.substring(validEnd);

      return new FIMExample({
        prompt: inputText,
        completion,
        context,
        format: FIMFormat.ZED,
        cursorPosition: validCursorPos,
        editableRegion: [validStart, validEnd],
        metadata: {
          filepath: editPair.filepath,
          commit: editPair.commitHash,
          language: editPair.language,
          commitMessage: editPair.commitMessage
        }
      });
    } catch (error) {
      // console.debug('Failed to create Zed format example:', error.message);
      return null;
    }
  }

  _createPSMFormatExample(code, cursorPos, editableRegion, editPair) {
    try {
      const middleSize = Math.min(50, code.length - cursorPos);
      const middleEnd = cursorPos + middleSize;

      const prefix = code.substring(0, cursorPos);
      const middle = code.substring(cursorPos, middleEnd);
      const suffix = code.substring(middleEnd);

      const prompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;

      return new FIMExample({
        prompt,
        completion: middle,
        context: code,
        format: FIMFormat.PSM,
        cursorPosition: cursorPos,
        editableRegion,
        metadata: {
          filepath: editPair.filepath,
          commit: editPair.commitHash,
          language: editPair.language,
          commitMessage: editPair.commitMessage
        }
      });
    } catch (error) {
      // console.debug('Failed to create PSM format example:', error.message);
      return null;
    }
  }

  _createSPMFormatExample(code, cursorPos, editableRegion, editPair) {
    try {
      const middleSize = Math.min(50, code.length - cursorPos);
      const middleEnd = cursorPos + middleSize;

      const prefix = code.substring(0, cursorPos);
      const middle = code.substring(cursorPos, middleEnd);
      const suffix = code.substring(middleEnd);

      const prompt = `<|fim_suffix|>${suffix}<|fim_prefix|>${prefix}<|fim_middle|>`;

      return new FIMExample({
        prompt,
        completion: middle,
        context: code,
        format: FIMFormat.SPM,
        cursorPosition: cursorPos,
        editableRegion,
        metadata: {
          filepath: editPair.filepath,
          commit: editPair.commitHash,
          language: editPair.language,
          commitMessage: editPair.commitMessage
        }
      });
    } catch (error) {
      // console.debug('Failed to create SPM format example:', error.message);
      return null;
    }
  }
}