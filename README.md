# Git Flash (JS)

This is a Node.js port of the original Python-based [`git-flash`](https://github.com/aloshdenny/git-flash) tool.
> Can be used as **`git-flash`** or **`git flash`** command.

## Installation

```bash
npm install -g git-flash-js
```

Upon successful installation, you will see a message displaying the installed version and usage instructions.

## Usage

### Generative Git Flow

Provide an instruction in natural language:

```bash
git flash "create a new branch called hotfix and switch to it"
```

### Manual Commit

Provide a specific commit message:

```bash
git flash -m "fix: resolve issue #123"
```

### Auto-commit

Run with no arguments for an auto-generated commit message based on staged changes:

```bash
git flash
```

### Check for Updates

Check if a new version of `git-flash-js` is available:

```bash
git flash --update
```

### Dry Run

Use the `--dry-run` flag to simulate any of the above commands without making changes:

```bash
git flash --dry-run "create a new feature branch"
```
