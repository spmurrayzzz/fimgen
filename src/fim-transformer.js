import { FIMFormat } from './types.js';
import { ASTProcessor } from './ast-processor.js';
import { StringRegionManager } from './utils/string-region-manager.js';
import { FIMExampleBuilder } from './builders/fim-example-builder.js';

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

      // Create a base builder with common properties
      const baseBuilder = new FIMExampleBuilder()
        .withCode(code)
        .withFormat(format)
        .withMetadata(editPair);

      for (const cursorPos of cursorPositions) {
        const validCursorPos = Math.max(0, Math.min(cursorPos, code.length - 1));
        const editableRegion = this._determineEditableRegion(code, validCursorPos);

        try {
          // Clone the base builder and set position-specific properties
          const example = baseBuilder
            .clone()
            .withCursor(validCursorPos)
            .withEditableRegion(editableRegion[0], editableRegion[1])
            .build();
          
          if (example) {
            examples.push(example);
          }
        } catch (error) {
          // Skip this example if builder fails
          if (process.env.NODE_ENV !== 'test') {
            console.warn(`Failed to build example at position ${validCursorPos}:`, error.message);
          }
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


}
