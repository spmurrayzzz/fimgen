/**
 * StringRegionManager - Centralized string position and region manipulation
 * 
 * This class reduces cognitive load by:
 * - Providing clear, tested boundary validation
 * - Making string operations self-documenting
 * - Centralizing all position-based logic
 * - Eliminating manual index tracking
 */
export class StringRegionManager {
  constructor(text) {
    this.text = text || '';
    this.length = this.text.length;
    this.lines = null; // Lazy-loaded
  }

  /**
   * Extract a region from the text with automatic boundary validation
   * @param {number} start - Start position (inclusive)
   * @param {number} end - End position (exclusive)
   * @returns {string} The extracted text region
   */
  extractRegion(start, end) {
    const validStart = Math.max(0, Math.min(start, this.length));
    const validEnd = Math.max(validStart, Math.min(end, this.length));
    return this.text.substring(validStart, validEnd);
  }

  /**
   * Insert a token at a specific position
   * @param {number} position - Position to insert at
   * @param {string} token - Token to insert
   * @returns {Object} Object with before, after, and combined text
   */
  insertToken(position, token) {
    const validPos = Math.max(0, Math.min(position, this.length));
    return {
      before: this.text.substring(0, validPos),
      after: this.text.substring(validPos),
      combined: this.text.substring(0, validPos) + token + this.text.substring(validPos)
    };
  }

  /**
   * Build a complex string with multiple text regions and tokens
   * @param {Array} regions - Array of region descriptors
   * @returns {string} The combined string
   * 
   * @example
   * manager.buildWithTokens([
   *   { type: 'text', start: 0, end: 10 },
   *   { type: 'token', token: '<|cursor|>' },
   *   { type: 'text', start: 10, end: 20 }
   * ])
   */
  buildWithTokens(regions) {
    return regions.reduce((result, region) => {
      if (region.type === 'text') {
        return result + this.extractRegion(region.start, region.end);
      } else if (region.type === 'token') {
        return result + region.token;
      }
      return result;
    }, '');
  }

  /**
   * Get line context for a specific position
   * @param {number} position - Position in the text
   * @returns {Object|null} Line context information
   */
  getLineContext(position) {
    this._ensureLinesCached();
    
    if (position < 0 || position > this.length) {
      return null;
    }

    let currentPos = 0;
    
    for (let i = 0; i < this.lines.length; i++) {
      const lineLength = this.lines[i].length;
      const lineEnd = currentPos + lineLength;
      
      if (position <= lineEnd) {
        return {
          lineNumber: i,
          lineStart: currentPos,
          lineEnd: lineEnd,
          lineText: this.lines[i],
          positionInLine: position - currentPos
        };
      }
      
      // +1 for newline character
      currentPos = lineEnd + 1;
    }
    
    // Position is beyond last line
    return {
      lineNumber: this.lines.length - 1,
      lineStart: currentPos - this.lines[this.lines.length - 1].length - 1,
      lineEnd: this.length,
      lineText: this.lines[this.lines.length - 1],
      positionInLine: this.lines[this.lines.length - 1].length
    };
  }

  /**
   * Find the boundaries of a code block containing the given position
   * @param {number} position - Position in the text
   * @returns {Object} Block boundaries
   */
  findBlockBoundaries(position) {
    const context = this.getLineContext(position);
    if (!context) {
      return { start: 0, end: this.length };
    }

    this._ensureLinesCached();
    
    const currentLine = context.lineNumber;
    const currentIndent = this._getIndentLevel(this.lines[currentLine]);
    
    // Find the parent block by looking for a line with less indentation
    // that defines the block (typically contains '{' or similar)
    let blockStart = currentLine;
    let blockIndent = currentIndent;
    
    // First, find the line that starts the block we're in
    for (let i = currentLine - 1; i >= 0; i--) {
      const line = this.lines[i];
      if (line.trim() === '') continue; // Skip empty lines
      
      const indent = this._getIndentLevel(line);
      if (indent < currentIndent) {
        // Found a line with less indentation - this should be the block start
        blockStart = i;
        blockIndent = indent;
        break;
      }
    }
    
    // Find block end by looking for where indentation returns to blockIndent or less
    let blockEnd = currentLine;
    for (let i = currentLine + 1; i < this.lines.length; i++) {
      const line = this.lines[i];
      
      // Include lines that are part of the same block
      const indent = this._getIndentLevel(line);
      if (line.trim() !== '' && indent <= blockIndent) {
        // Check if this is the closing brace at the same level as block start
        if (indent === blockIndent && line.trim() === '}') {
          blockEnd = i;
        } else {
          blockEnd = i - 1;
        }
        break;
      }
      blockEnd = i; // Extend to include all lines until we find a break
    }
    
    // Convert line numbers to character positions
    const startPos = this._lineToPosition(Math.max(0, blockStart));
    const endPos = this._lineToPosition(Math.min(this.lines.length - 1, blockEnd)) + 
                   this.lines[Math.min(this.lines.length - 1, blockEnd)].length;
    
    return {
      start: startPos,
      end: endPos,
      startLine: blockStart,
      endLine: blockEnd
    };
  }

  /**
   * Validate and clamp a position to valid bounds
   * @param {number} position - Position to validate
   * @returns {number} Valid position within bounds
   */
  clampPosition(position) {
    return Math.max(0, Math.min(position, this.length));
  }

  /**
   * Check if a position is valid
   * @param {number} position - Position to check
   * @returns {boolean} True if position is valid
   */
  isValidPosition(position) {
    return position >= 0 && position <= this.length;
  }

  /**
   * Get statistics about the text
   * @returns {Object} Text statistics
   */
  getStatistics() {
    this._ensureLinesCached();
    
    return {
      length: this.length,
      lines: this.lines.length,
      nonEmptyLines: this.lines.filter(l => l.trim().length > 0).length,
      averageLineLength: this.lines.length > 0 
        ? Math.round(this.length / this.lines.length) 
        : 0
    };
  }

  /**
   * Split text at a position and return both parts
   * @param {number} position - Position to split at
   * @returns {Object} Object with prefix and suffix
   */
  splitAt(position) {
    const validPos = this.clampPosition(position);
    return {
      prefix: this.text.substring(0, validPos),
      suffix: this.text.substring(validPos),
      position: validPos
    };
  }

  /**
   * Create a new StringRegionManager for a substring
   * @param {number} start - Start position
   * @param {number} end - End position
   * @returns {StringRegionManager} New manager for the substring
   */
  createSubregion(start, end) {
    const text = this.extractRegion(start, end);
    return new StringRegionManager(text);
  }

  // Private helper methods

  _ensureLinesCached() {
    if (this.lines === null) {
      this.lines = this.text.split('\n');
    }
  }

  _getIndentLevel(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  _lineToPosition(lineNumber) {
    this._ensureLinesCached();
    
    if (lineNumber < 0 || lineNumber >= this.lines.length) {
      return 0;
    }
    
    let position = 0;
    for (let i = 0; i < lineNumber; i++) {
      position += this.lines[i].length + 1; // +1 for newline
    }
    return position;
  }
}

/**
 * RegionDescriptor - Describes a region for building complex strings
 */
export class RegionDescriptor {
  static text(start, end) {
    return { type: 'text', start, end };
  }

  static token(token) {
    return { type: 'token', token };
  }
}