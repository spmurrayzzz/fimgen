# FIMGen Agent Onboarding

## Repository Snapshot
- Purpose: generate Fill-in-the-Middle (FIM) training datasets from Git repositories and ship a CLI plus JSONL viewer. Works for KTO and DPO data.
- Stack: ES modules on Node.js (prefers Bun runtime). Core language is JavaScript. Depends on `simple-git` and `winston`; no TypeScript.
- Size: ~10 source files plus focused tests. Key runtime paths live in `src/` with mirrored tests in `test/`. Repository includes sample output under `dataset/` and reference dumps in `dump/`.

## Environment & Tooling
- Node version: `.nvmrc` pins **v22.18.0** (any >=18 works). Bun is primary runtime; CI installs the latest Bun.
- Package manager: Bun. Always run `bun install` after pulling to sync dependencies (`bun install` succeeds in ~30 ms and prints harmless `fnm`/`pyenv` permission warnings inside the sandbox).
- `NODE_ENV=test` is set by every test script to silence winston console output (`src/dataset-builder.js`).
- Required system tools: `git` (used heavily by `GitHistoryMiner`). Ensure the target repo for dataset generation contains a `.git` directory.

## Build, Test, and Lint Workflow
Always execute these from the repository root once dependencies are installed.
- **Bootstrap**: `bun install`
  - Preconditions: Bun ≥1.0.0 on PATH. Command emits `Operation not permitted` warnings for fnm/pyenv symlinks in this sandbox; ignore them—they do not affect installs.
- **Lint**: `npm run lint`
  - Runs ESLint using `.eslintrc` against `src/`. Completes in <1 s. Auto-fix with `npm run lint:fix` when needed.
- **Tests**: `bun test`
  - Uses Bun’s Node-compatible test runner; completes in ~70 ms with 14 passing assertions across 11 files. Expect the same fnm/pyenv warnings before the Bun banner. Targeted suites exist (e.g. `bun test test/git-history-miner.test.js`). `npm test` delegates to the same script if Bun invocation via npm is preferred.
- **CLI smoke test**: `bun start <path-to-git-repo> --max-commits 5 --dataset-type kto --format ZED`
  - Verified against this repo; generates JSONL under `dataset/` and logs to `dataset/dataset_generation.log`. Ensure the path points to a real Git repo or the CLI exits with “Invalid git repository path”.
- **Viewer**: inspect outputs with `bun run viewer dataset/train_kto.jsonl` (interactive controls described in `README.md`).

## Project Layout & Key Modules
- `src/index.js`: CLI entry point; parses arguments via `node:util.parseArgs`, validates date options, instantiates `DatasetBuilder`.
- `src/dataset-builder.js`: Orchestrates dataset creation. Composes `GitHistoryMiner`, `FIMTransformer`, and `NegativeExampleGenerator`, writes JSONL/stat files, and manages Winston logging.
- `src/git-history-miner.js`: Wraps `simple-git` to diff recent commits, filters files via `QualityFilter`, and emits `EditPair` objects.
- `src/fim-transformer.js`: Converts edit pairs into FIM prompts/completions, handling PSM/SPM/ZED/MIXED formats and cursor metadata.
- `src/negative-example-generator.js`: Produces synthetic negative completions (helpers `_applyDegradation`, etc.).
- `src/builders/fim-example-builder.js`: Builder utilities for assembling FIM samples.
- `src/utils/string-region-manager.js`: Manages editable region calculations.
- `src/types.js`: Exported enums/data classes (`FIMFormat`, `EditPair`, `FIMExample`, `KTOExample`).
- Tests live in `test/` with one file per module plus `test-helper.js` (assert wrappers and fixtures). CLI tests spawn child processes and create temp dirs; no extra setup required.
- Sample datasets in `dataset/` illustrate expected outputs (`train_kto.jsonl`, `test_kto.jsonl`, `kto_stats.json`).
- `dump/` mirrors selected `src/` files for reference snapshots.

## Validation & CI
- GitHub Actions workflow `.github/workflows/ci.yml` runs on pushes/PRs to `master`:
  1. **Lint job**: checkout → install Bun → `bun install` → `npm run lint`.
  2. **Test job**: matrix on Node 20.x & 22.x, installs Bun + deps, sets global git user, then `bun test` with `TZ=UTC`.
- To mirror CI locally, run `bun install`, `npm run lint`, and `bun test` in that order. Matching Node/Bun versions avoids surprises with `engine-strict` (`.npmrc`).

## Additional Notes & Known Behaviors
- Commands executed here always precede their output with `Using Node v22.18.0` and `Operation not permitted` warnings from Homebrew/fnm/pyenv hooks; they are cosmetic in this sandbox.
- Dataset generation timestamps derive from the host clock and may appear offset; this is expected.
- `simple-git` operations honor the default commit limit of 1000 and skip merges. Adjust via `--max-commits` when running the CLI.
- Logging: full run details accumulate in `dataset/dataset_generation.log`; delete or rotate as needed before committing artifacts.
- Documentation: `README.md` covers CLI usage and viewer commands; `cognitive-load.md` is informational only.

## Root Directory Reference
- `.eslintrc` – ESLint config (semi/quotes/no-unused-vars rules).
- `.github/workflows/ci.yml` – CI definition described above.
- `.nvmrc` / `.npmrc` – Node version pin & npm settings (`engine-strict`, no package-lock).
- `bun.lock` – Bun dependency lockfile.
- `package.json` – Scripts (`start`, `viewer`, granular `test:*`, lint), binary entry points (`fimgen`, `fimview`).
- `dataset/`, `dump/`, `src/`, `test/` – primary data and code directories.
- `LICENSE`, `README.md`, `cognitive-load.md`, `AGENTS.md` – project documentation.

## Final Guidance
Trust this document. Follow the bootstrap → lint → test flow exactly as outlined, then branch into feature-specific code. Only fall back to additional searches if you discover discrepancies between these instructions and observed behavior.
