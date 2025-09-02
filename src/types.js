export const FIMFormat = {
  PSM: 'prefix_suffix_middle',
  SPM: 'suffix_prefix_middle',
  ZED: 'zed_format',
  MIXED: 'mixed'
};

export class EditPair {
  constructor({
    before,
    after,
    diff,
    filepath,
    commitHash,
    commitMessage,
    language,
    contextFiles = []
  }) {
    this.before = before;
    this.after = after;
    this.diff = diff;
    this.filepath = filepath;
    this.commitHash = commitHash;
    this.commitMessage = commitMessage;
    this.language = language;
    this.contextFiles = contextFiles;
  }
}

export class FIMExample {
  constructor({
    prompt,
    completion,
    context,
    format,
    cursorPosition,
    editableRegion,
    metadata = {}
  }) {
    this.prompt = prompt;
    this.completion = completion;
    this.context = context;
    this.format = format;
    this.cursorPosition = cursorPosition;
    this.editableRegion = editableRegion;
    this.metadata = metadata;
  }
}

export class KTOExample {
  constructor({
    prompt,
    completion,
    label,
    metadata = {}
  }) {
    this.prompt = prompt;
    this.completion = completion;
    this.label = label;
    this.metadata = metadata;
  }
}