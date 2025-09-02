import { simpleGit } from 'simple-git';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditPair } from './types.js';
import { QualityFilter } from './quality-filter.js';

export class GitHistoryMiner {
  constructor(repoPath) {
    this.repoPath = resolve(repoPath);
    if (!existsSync(this.repoPath) || !existsSync(`${this.repoPath}/.git`)) {
      throw new Error(`Invalid git repository path: ${repoPath}`);
    }
    
    this.git = simpleGit(this.repoPath);
    this.qualityFilter = new QualityFilter();
  }

  async extractEditPairs(fileExtensions = null, maxCommits = 1000, startDate = null, endDate = null) {
    if (!fileExtensions) {
      fileExtensions = ['.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.c', '.go', '.rs'];
    }

    const editPairs = [];
    
    try {
      // console.log(`Mining repository: ${this.repoPath}`);
      
      const logOptions = ['--no-merges', '-n', String(maxCommits)];
      
      if (startDate) {
        logOptions.push(`--since=${startDate.toISOString()}`);
      }
      
      if (endDate) {
        logOptions.push(`--until=${endDate.toISOString()}`);
      }
      
      const log = await this.git.log(logOptions);
      const commits = log.all;

      for (const commit of commits) {
        try {
          const pairs = await this._processCommit(commit, fileExtensions);
          editPairs.push(...pairs);
        } catch (error) {
          // console.debug(`Failed to process commit ${commit.hash}: ${error.message}`);
        }
      }
    } catch (error) {
      // console.error(`Failed to mine repository: ${error.message}`);
      // Return empty array for repos with no commits
      if (error.message.includes('does not have any commits')) {
        return [];
      }
      throw error;
    }

    // console.log(`Extracted ${editPairs.length} edit pairs`);
    return editPairs;
  }

  async _processCommit(commit, fileExtensions) {
    const editPairs = [];
    
    try {
      const diff = await this.git.diff([`${commit.hash}^`, commit.hash]);
      const files = this._parseGitDiff(diff);
      
      for (const file of files) {
        if (!this._shouldProcessFile(file.path, fileExtensions)) {
          continue;
        }

        const editPair = await this._processFile(file, commit);
        if (editPair) {
          editPairs.push(editPair);
        }
      }
    } catch (error) {
      // console.debug(`Error processing commit ${commit.hash}: ${error.message}`);
    }
    
    return editPairs;
  }

  async _processFile(file, commit) {
    try {
      const language = this._detectLanguage(file.path);
      if (language === 'unknown') {
        return null;
      }

      const before = await this._getFileContent(commit.hash + '^', file.path);
      const after = await this._getFileContent(commit.hash, file.path);
      
      if (!before || !after) {
        return null;
      }

      if (!this.qualityFilter.passesQualityChecks(after, language)) {
        return null;
      }

      if (!this.qualityFilter.passesQualityChecks(before, language)) {
        return null;
      }

      if (!this.qualityFilter.isSemanticChange(file.diff)) {
        return null;
      }

      return new EditPair({
        before,
        after,
        diff: file.diff,
        filepath: file.path,
        commitHash: commit.hash,
        commitMessage: (commit.message || '').substring(0, 200),
        language
      });
    } catch (error) {
      // console.debug(`Failed to process file ${file.path}: ${error.message}`);
      return null;
    }
  }

  async _getFileContent(revision, filepath) {
    try {
      const content = await this.git.show([`${revision}:${filepath}`]);
      return content;
    } catch {
      return null;
    }
  }

  _parseGitDiff(diff) {
    const files = [];
    const lines = diff.split('\n');
    let currentFile = null;
    let currentDiff = [];

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          currentFile.diff = currentDiff.join('\n');
          files.push(currentFile);
        }
        
        const match = line.match(/b\/(.+)$/);
        currentFile = {
          path: match ? match[1] : '',
          diff: ''
        };
        currentDiff = [line];
      } else if (currentFile) {
        currentDiff.push(line);
      }
    }

    if (currentFile) {
      currentFile.diff = currentDiff.join('\n');
      files.push(currentFile);
    }

    return files;
  }

  _shouldProcessFile(filepath, extensions) {
    return extensions.some(ext => filepath.toLowerCase().endsWith(ext));
  }

  _detectLanguage(filename) {
    const extensionMap = {
      '.py': 'python',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.java': 'java',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r'
    };

    const lower = filename.toLowerCase();
    for (const [ext, lang] of Object.entries(extensionMap)) {
      if (lower.endsWith(ext)) {
        return lang;
      }
    }
    return 'unknown';
  }
}