import { FIMExample, FIMFormat } from '../types.js';
import { StringRegionManager, RegionDescriptor } from '../utils/string-region-manager.js';

export class FIMExampleBuilder {
  constructor() {
    this.reset();
  }

  /**
   * Reset the builder to initial state for building a new example
   */
  reset() {
    this.code = '';
    this.cursorPosition = null;
    this.editableRegion = null;
    this.format = null;
    this.metadata = {};
    this.manager = null;
    return this;
  }

  /**
   * Set the code for the FIM example
   */
  withCode(code) {
    if (!code) {
      throw new Error('Code cannot be empty');
    }
    this.code = code;
    this.manager = new StringRegionManager(code);
    return this;
  }

  /**
   * Set the cursor position
   */
  withCursor(position) {
    if (!this.manager) {
      throw new Error('Must call withCode() before withCursor()');
    }
    this.cursorPosition = this.manager.clampPosition(position);
    return this;
  }

  /**
   * Set the editable region boundaries
   */
  withEditableRegion(start, end) {
    if (!this.manager) {
      throw new Error('Must call withCode() before withEditableRegion()');
    }
    // Clamp to valid range [0, length-1] for inclusive positions
    const validStart = Math.max(0, Math.min(start, this.code.length - 1));
    const validEnd = Math.max(validStart, Math.min(end, this.code.length - 1));

    // Ensure cursor is within editable region if it's been set
    // Allow cursor to be one position beyond end (to represent position after last char)
    if (this.cursorPosition !== null && this.cursorPosition !== undefined) {
      if (this.cursorPosition < validStart || this.cursorPosition > validEnd + 1) {
        this.cursorPosition = Math.max(validStart, Math.min(this.cursorPosition, validEnd + 1));
      }
    }

    this.editableRegion = [validStart, validEnd];
    return this;
  }

  /**
   * Set the FIM format
   */
  withFormat(format) {
    const validFormats = Object.values(FIMFormat);
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
    }
    this.format = format;
    return this;
  }

  /**
   * Set metadata from an EditPair
   */
  withMetadata(editPair) {
    this.metadata = {
      filepath: editPair.filepath,
      commit: editPair.commitHash,
      language: editPair.language,
      commitMessage: editPair.commitMessage
    };
    return this;
  }

  /**
   * Build the FIM example based on the configured format
   */
  build() {
    this._validate();

    switch (this.format) {
      case FIMFormat.ZED:
        return this._buildZedFormat();
      case FIMFormat.PSM:
        return this._buildPSMFormat();
      case FIMFormat.SPM:
        return this._buildSPMFormat();
      case FIMFormat.MIXED:
        // For MIXED, randomly choose PSM or SPM
        // TODO: add support for defining the split
        return Math.random() < 0.5 ? this._buildPSMFormat() : this._buildSPMFormat();
      default:
        throw new Error(`Unsupported format: ${this.format}`);
    }
  }

  /**
   * Build a ZED format example
   * Note: this format is the one im least confident in, so needs more testing
   */
  _buildZedFormat() {
    const [start, end] = this.editableRegion;

    // Build the prompt with tokens up to cursor position
    const prompt = this.manager.buildWithTokens([
      RegionDescriptor.text(0, start),
      RegionDescriptor.token('<|editable_region_start|>'),
      RegionDescriptor.text(start, this.cursorPosition),
      RegionDescriptor.token('<|user_cursor_is_here|>')
    ]);

    // Extract completion from cursor to end of editable region  
    // Note: end is inclusive, but extractRegion expects exclusive end, so add 1
    // If cursor is beyond the editable region end, completion is empty
    const completion = this.cursorPosition > end 
      ? '' 
      : this.manager.extractRegion(this.cursorPosition, end + 1) || '';

    // Build full context with all tokens
    const context = this.manager.buildWithTokens([
      RegionDescriptor.text(0, start),
      RegionDescriptor.token('<|editable_region_start|>'),
      RegionDescriptor.text(start, this.cursorPosition),
      RegionDescriptor.token('<|user_cursor_is_here|>'),
      RegionDescriptor.text(this.cursorPosition, end + 1),
      RegionDescriptor.token('<|editable_region_end|>'),
      RegionDescriptor.text(end + 1, this.code.length)
    ]);

    return new FIMExample({
      prompt,
      completion,
      context,
      format: FIMFormat.ZED,
      cursorPosition: this.cursorPosition,
      editableRegion: this.editableRegion,
      metadata: this.metadata
    });
  }

  /**
   * Build a PSM (Prefix-Suffix-Middle) format example
   */
  _buildPSMFormat() {
    // Determine middle region (typically 50 chars after cursor)
    // not sure if 50 is a good default here, but will run with it for now
    const middleSize = Math.min(50, this.code.length - this.cursorPosition);
    const middleEnd = this.cursorPosition + middleSize;

    // Build prompt in PSM order
    const prompt = this.manager.buildWithTokens([
      RegionDescriptor.token('<|fim_prefix|>'),
      RegionDescriptor.text(0, this.cursorPosition),
      RegionDescriptor.token('<|fim_suffix|>'),
      RegionDescriptor.text(middleEnd, this.code.length),
      RegionDescriptor.token('<|fim_middle|>')
    ]);

    const completion = this.manager.extractRegion(this.cursorPosition, middleEnd) || '';

    return new FIMExample({
      prompt,
      completion,
      context: this.code,
      format: FIMFormat.PSM,
      cursorPosition: this.cursorPosition,
      editableRegion: this.editableRegion,
      metadata: this.metadata
    });
  }

  /**
   * Build a SPM (Suffix-Prefix-Middle) format example
   */
  _buildSPMFormat() {
    const middleSize = Math.min(50, this.code.length - this.cursorPosition);
    const middleEnd = this.cursorPosition + middleSize;

    // Build prompt in SPM order
    const prompt = this.manager.buildWithTokens([
      RegionDescriptor.token('<|fim_suffix|>'),
      RegionDescriptor.text(middleEnd, this.code.length),
      RegionDescriptor.token('<|fim_prefix|>'),
      RegionDescriptor.text(0, this.cursorPosition),
      RegionDescriptor.token('<|fim_middle|>')
    ]);

    const completion = this.manager.extractRegion(this.cursorPosition, middleEnd) || '';

    return new FIMExample({
      prompt,
      completion,
      context: this.code,
      format: FIMFormat.SPM,
      cursorPosition: this.cursorPosition,
      editableRegion: this.editableRegion,
      metadata: this.metadata
    });
  }

  /**
   * Validate that all required properties are set
   */
  _validate() {
    if (!this.code) {
      throw new Error('Code is required. Call withCode() first.');
    }
    if (!this.format) {
      throw new Error('Format is required. Call withFormat() first.');
    }
    if (this.editableRegion === null) {
      throw new Error('Editable region is required. Call withEditableRegion() first.');
    }
    if (this.cursorPosition === null || this.cursorPosition === undefined) {
      throw new Error('Cursor position is required. Call withCursor() first.');
    }
  }

  /**
   * Clone the current builder state
   */
  clone() {
    const newBuilder = new FIMExampleBuilder();
    newBuilder.code = this.code;
    newBuilder.cursorPosition = this.cursorPosition;
    newBuilder.editableRegion = this.editableRegion ? [...this.editableRegion] : null;
    newBuilder.format = this.format;
    newBuilder.metadata = { ...this.metadata };
    newBuilder.manager = this.manager;
    return newBuilder;
  }
}
