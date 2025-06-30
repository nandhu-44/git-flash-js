# Git Flash (JS)

This is a Node.js port of the original Python-based `git-flash` tool.

## Installation

```bash
npm install -g git-flash-js
```

## Usage

### Generative Git Flow

Provide an instruction in natural language:

```bash
git-flash "create a new branch called hotfix and switch to it"
```

### Manual Commit

Provide a specific commit message:

```bash
git-flash -m "fix: resolve issue #123"
```

### Auto-commit

Run with no arguments for an auto-generated commit message based on staged changes:

```bash
git-flash
```

### Dry Run

Use the `--dry-run` flag to simulate any of the above commands without making changes:

```bash
git-flash --dry-run "create a new feature branch"
```
