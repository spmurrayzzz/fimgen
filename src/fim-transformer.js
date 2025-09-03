import { FIMExample, FIMFormat } from './types.js';
import { ASTProcessor } from './ast-processor.js';
import { StringRegionManager, RegionDescriptor } from './utils/string-region-manager.js';

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

    const manager = new StringRegionManager(code);

    const safeCursorPos = manager.clampPosition(cursorPos);

    const boundaries = manager.findBlockBoundaries(safeCursorPos);

    let startPos = boundaries.start;
    let endPos = boundaries.end;

    if (safeCursorPos < startPos) {
      startPos = Math.max(0, safeCursorPos - 50);
    }
    if (safeCursorPos > endPos) {
      endPos = Math.min(code.length, safeCursorPos + 50);
    }

    return [startPos, endPos];
  }



  _createZedFormatExample(code, cursorPos, editableRegion, editPair) {
    try {
      const manager = new StringRegionManager(code);
      const [start, end] = editableRegion;

      const validStart = manager.clampPosition(start);
      const validEnd = manager.clampPosition(end);
      const validCursorPos = manager.clampPosition(
        Math.max(validStart, Math.min(cursorPos, validEnd))
      );

      const inputText = manager.buildWithTokens([
        RegionDescriptor.text(0, validStart),
        RegionDescriptor.token('<|editable_region_start|>'),
        RegionDescriptor.text(validStart, validCursorPos),
        RegionDescriptor.token('<|user_cursor_is_here|>')
      ]);

      const completion = manager.extractRegion(validCursorPos, validEnd);

      const context = manager.buildWithTokens([
        RegionDescriptor.text(0, validStart),
        RegionDescriptor.token('<|editable_region_start|>'),
        RegionDescriptor.text(validStart, validCursorPos),
        RegionDescriptor.token('<|user_cursor_is_here|>'),
        RegionDescriptor.text(validCursorPos, validEnd),
        RegionDescriptor.token('<|editable_region_end|>'),
        RegionDescriptor.text(validEnd, code.length)
      ]);

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
      return null;
    }
  }

  _createPSMFormatExample(code, cursorPos, editableRegion, editPair) {
    try {
      const manager = new StringRegionManager(code);
      const validCursorPos = manager.clampPosition(cursorPos);

      const middleSize = Math.min(50, code.length - validCursorPos);
      const middleEnd = validCursorPos + middleSize;

      const prompt = manager.buildWithTokens([
        RegionDescriptor.token('<|fim_prefix|>'),
        RegionDescriptor.text(0, validCursorPos),
        RegionDescriptor.token('<|fim_suffix|>'),
        RegionDescriptor.text(middleEnd, code.length),
        RegionDescriptor.token('<|fim_middle|>')
      ]);

      const completion = manager.extractRegion(validCursorPos, middleEnd);

      return new FIMExample({
        prompt,
        completion,
        context: code,
        format: FIMFormat.PSM,
        cursorPosition: validCursorPos,
        editableRegion,
        metadata: {
          filepath: editPair.filepath,
          commit: editPair.commitHash,
          language: editPair.language,
          commitMessage: editPair.commitMessage
        }
      });
    } catch (error) {
      return null;
    }
  }

  _createSPMFormatExample(code, cursorPos, editableRegion, editPair) {
    try {
      const manager = new StringRegionManager(code);
      const validCursorPos = manager.clampPosition(cursorPos);

      const middleSize = Math.min(50, code.length - validCursorPos);
      const middleEnd = validCursorPos + middleSize;

      const prompt = manager.buildWithTokens([
        RegionDescriptor.token('<|fim_suffix|>'),
        RegionDescriptor.text(middleEnd, code.length),
        RegionDescriptor.token('<|fim_prefix|>'),
        RegionDescriptor.text(0, validCursorPos),
        RegionDescriptor.token('<|fim_middle|>')
      ]);

      const completion = manager.extractRegion(validCursorPos, middleEnd);

      return new FIMExample({
        prompt,
        completion,
        context: code,
        format: FIMFormat.SPM,
        cursorPosition: validCursorPos,
        editableRegion,
        metadata: {
          filepath: editPair.filepath,
          commit: editPair.commitHash,
          language: editPair.language,
          commitMessage: editPair.commitMessage
        }
      });
    } catch (error) {
      return null;
    }
  }
}
