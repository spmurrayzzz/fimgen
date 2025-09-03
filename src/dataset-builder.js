import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { GitHistoryMiner } from './git-history-miner.js';
import { FIMTransformer } from './fim-transformer.js';
import { NegativeExampleGenerator } from './negative-example-generator.js';
import { KTOExample, FIMFormat } from './types.js';
import { createLogger, format, transports } from 'winston';

export class DatasetBuilder {
  constructor(repoPath, outputDir = './dataset') {
    this.repoPath = repoPath;
    this.outputDir = resolve(outputDir);
    mkdirSync(this.outputDir, { recursive: true });

    this.gitMiner = new GitHistoryMiner(repoPath);
    this.fimTransformer = new FIMTransformer();
    this.negativeGenerator = new NegativeExampleGenerator();

    // Only log to console in production mode, not during tests
    const logTransports = [
      new transports.File({ 
        filename: join(this.outputDir, 'dataset_generation.log'),
        level: 'debug' 
      })
    ];
    
    if (process.env.NODE_ENV !== 'test') {
      logTransports.push(new transports.Console({ level: 'info' }));
    }

    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => 
          `${timestamp} - ${level.toUpperCase()} - ${message}`
        )
      ),
      transports: logTransports,
      silent: process.env.NODE_ENV === 'test'
    });
  }

  async buildKTODataset({
    maxCommits = 1000,
    fimFormat = FIMFormat.ZED,
    trainTestSplit = 0.9,
    fileExtensions = null,
    startDate = null,
    endDate = null
  }) {
    this._logBuildInfo('KTO', fimFormat, maxCommits, startDate, endDate);

    try {
      this.logger.info('Extracting edit pairs from git history...');
      const editPairs = await this.gitMiner.extractEditPairs(fileExtensions, maxCommits, startDate, endDate);

      if (!editPairs.length) {
        this.logger.warn('No edit pairs extracted from repository');
        return { error: 'No valid edit pairs found' };
      }

      this.logger.info(`Extracted ${editPairs.length} edit pairs`);

      this.logger.info('Generating positive FIM examples...');
      const positiveFIMExamples = [];

      for (const editPair of editPairs) {
        const examples = this.fimTransformer.createFIMExamples(editPair, fimFormat);
        positiveFIMExamples.push(...examples);
      }

      if (!positiveFIMExamples.length) {
        this.logger.warn('No FIM examples generated');
        return { error: 'No FIM examples could be generated' };
      }

      this.logger.info(`Generated ${positiveFIMExamples.length} positive examples`);

      const positiveKTO = positiveFIMExamples.map(ex => new KTOExample({
        prompt: ex.prompt,
        completion: ex.completion || '',  // Ensure completion is never null
        label: true,
        metadata: ex.metadata
      }));

      this.logger.info('Generating negative examples...');
      const negativeKTO = this.negativeGenerator.generateNegativeExamples(positiveFIMExamples);
      this.logger.info(`Generated ${negativeKTO.length} negative examples`);

      let finalNegativeKTO = negativeKTO;
      if (negativeKTO.length > positiveKTO.length) {
        finalNegativeKTO = this._randomSample(negativeKTO, positiveKTO.length);
      }

      const allExamples = [...positiveKTO, ...finalNegativeKTO];
      this._shuffleArray(allExamples);

      const splitIdx = Math.floor(allExamples.length * trainTestSplit);
      const trainExamples = allExamples.slice(0, splitIdx);
      const testExamples = allExamples.slice(splitIdx);

      this._saveDataset(trainExamples, 'train_kto.jsonl');
      this._saveDataset(testExamples, 'test_kto.jsonl');

      const stats = {
        totalExamples: allExamples.length,
        positiveExamples: positiveKTO.length,
        negativeExamples: finalNegativeKTO.length,
        trainExamples: trainExamples.length,
        testExamples: testExamples.length,
        uniqueFiles: new Set(allExamples
          .filter(ex => ex.metadata)
          .map(ex => ex.metadata.filepath)).size,
        format: fimFormat,
        generatedAt: new Date().toISOString()
      };

      this._saveStats(stats, 'kto_stats.json');
      this.logger.info('Dataset generation completed successfully');

      return stats;
    } catch (error) {
      this.logger.error(`Dataset generation failed: ${error.message}`);
      this.logger.error(error.stack);
      return { error: error.message };
    }
  }

  async buildDPODataset({
    maxCommits = 1000,
    fimFormat = FIMFormat.ZED,
    trainTestSplit = 0.9,
    fileExtensions = null,
    startDate = null,
    endDate = null
  }) {
    this._logBuildInfo('DPO', fimFormat, maxCommits, startDate, endDate);

    try {
      const editPairs = await this.gitMiner.extractEditPairs(fileExtensions, maxCommits, startDate, endDate);

      if (!editPairs.length) {
        return { error: 'No valid edit pairs found' };
      }

      const dpoExamples = [];

      for (const editPair of editPairs) {
        const preferredExamples = this.fimTransformer.createFIMExamples(
          editPair, fimFormat, 1
        );

        if (preferredExamples.length > 0) {
          const pref = preferredExamples[0];
          const degraded = this.negativeGenerator._applyDegradation(
            pref.completion,
            this.negativeGenerator._chooseDegradationMethod(),
            editPair.language
          );

          dpoExamples.push({
            prompt: pref.prompt,
            chosen: pref.completion,
            rejected: degraded,
            metadata: pref.metadata
          });
        }
      }

      if (!dpoExamples.length) {
        return { error: 'No DPO examples could be generated' };
      }

      this._shuffleArray(dpoExamples);
      const splitIdx = Math.floor(dpoExamples.length * trainTestSplit);

      const trainExamples = dpoExamples.slice(0, splitIdx);
      const testExamples = dpoExamples.slice(splitIdx);

      this._saveDataset(trainExamples, 'train_dpo.jsonl');
      this._saveDataset(testExamples, 'test_dpo.jsonl');

      const stats = {
        totalExamples: dpoExamples.length,
        trainExamples: trainExamples.length,
        testExamples: testExamples.length,
        format: fimFormat,
        generatedAt: new Date().toISOString()
      };

      this._saveStats(stats, 'dpo_stats.json');

      return stats;
    } catch (error) {
      this.logger.error(`DPO dataset generation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  _logBuildInfo(datasetType, fimFormat, maxCommits, startDate, endDate) {
    this.logger.info(`Building ${datasetType} dataset from ${this.repoPath}`);
    this.logger.info(`Format: ${fimFormat}, Max commits: ${maxCommits}`);
    if (startDate) {
      this.logger.info(`Start date: ${startDate.toISOString()}`);
    }
    if (endDate) {
      this.logger.info(`End date: ${endDate.toISOString()}`);
    }
  }

  _saveDataset(examples, filename) {
    const outputPath = join(this.outputDir, filename);

    try {
      const lines = examples.map(example => {
        const jsonObj = example.constructor.name === 'KTOExample' 
          ? {
              prompt: example.prompt,
              completion: example.completion || '',
              label: example.label,
              metadata: example.metadata
            }
          : example;
        
        return JSON.stringify(jsonObj);
      });
      
      writeFileSync(outputPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
      this.logger.info(`Saved ${examples.length} examples to ${outputPath}`);
    } catch (error) {
      this.logger.error(`Failed to save dataset: ${error.message}`);
      throw error;
    }
  }

  _saveStats(stats, filename = 'stats.json') {
    const statsPath = join(this.outputDir, filename);

    try {
      writeFileSync(statsPath, JSON.stringify(stats, null, 2));
      this.logger.info(`Saved statistics to ${statsPath}`);
    } catch (error) {
      this.logger.error(`Failed to save statistics: ${error.message}`);
    }
  }

  _shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  _randomSample(array, size) {
    const shuffled = [...array];
    this._shuffleArray(shuffled);
    return shuffled.slice(0, size);
  }
}