#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import ncu from 'npm-check-updates';

const program = new Command();

const CONFIG_DIR = path.join(os.homedir(), '.config', 'git-flash');
const ENV_FILE = path.join(CONFIG_DIR, '.env');

async function getApiKey() {
    let apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        return apiKey;
    }

    try {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
        const envContent = await fs.readFile(ENV_FILE, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY="?([^"\n]+)"?/);
        if (match) {
            apiKey = match[1];
            if (apiKey) {
                return apiKey;
            }
        }
    } catch (error) {
        // Ignore if the file doesn't exist
    }

    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    apiKey = await new Promise((resolve) => {
        rl.question('Please enter your Gemini API key: ', (key) => {
            resolve(key);
        });
    });

    if (!apiKey) {
        console.log(chalk.red.bold('Error: No API key provided.'));
        process.exit(1);
    }

    const confirmSave = await new Promise((resolve) => {
        rl.question(`Save this key to ${chalk.cyan.bold(ENV_FILE)} for future use? (y/n) `, (answer) => {
            resolve(answer.toLowerCase() === 'y');
        });
    });

    if (confirmSave) {
        await fs.writeFile(ENV_FILE, `GEMINI_API_KEY="${apiKey}"\n`);
        console.log(chalk.green('✓ API key saved.'));
    }

    rl.close();
    return apiKey;
}

async function runGenerativeGitFlow(instruction, dryRun) {
    console.log(chalk.cyan.bold(`▶️  User Goal: ${instruction}`));

    const genAI = new GoogleGenerativeAI(await getApiKey());

    const availableTools = {
        functionDeclarations: [
            {
                name: 'run_git_command',
                description: 'Executes a git command. Do not include \'git\' in the command string.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        command: { type: 'STRING' },
                    },
                    required: ['command'],
                },
            },
            {
                name: 'list_files',
                description: 'Lists files and directories in a specified path. Use \'.\' for the current directory.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'read_file',
                description: 'Reads and returns the content of a specified file.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'write_file',
                description: 'Writes or overwrites content to a specified file. Creates the file if it does not exist.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                        content: { type: 'STRING' },
                    },
                    required: ['path', 'content'],
                },
            },
            {
                name: 'move_file',
                description: 'Moves or renames a file or directory.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        source: { type: 'STRING' },
                        destination: { type: 'STRING' },
                    },
                    required: ['source', 'destination'],
                },
            },
            {
                name: 'delete_file',
                description: 'Deletes a specified file.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'create_directory',
                description: 'Creates a new directory, including any necessary parent directories.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'delete_directory',
                description: 'Deletes a directory and all of its contents recursively.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'list_directory_tree',
                description: 'Recursively lists the directory tree structure starting at a given path.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'read_directory_files',
                description: 'Reads the contents of all files in the given directory (non-recursive).',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'get_current_directory',
                description: 'Returns the current working directory path.',
                parameters: {
                    type: 'OBJECT',
                    properties: {},
                },
            },
        ],
    };

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', tools: availableTools });
    const chat = model.startChat();

    const initialPrompt = `You are Git Flash, an AI assistant for git and file system operations. You are operating in the directory: ${process.cwd()}. The user's goal is: ${instruction}`;
    let response = await chat.sendMessage(initialPrompt);

    while (response.response.candidates[0].content.parts && response.response.candidates[0].content.parts[0].functionCall) {
        const functionCall = response.response.candidates[0].content.parts[0].functionCall;
        const { name, args } = functionCall;

        const commandDisplay = `${name}(${Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})`;
        console.log(chalk.yellow.bold(`🤖 Agent wants to run: ${commandDisplay}`));

        let toolOutput;
        if (dryRun) {
            console.log(chalk.magenta.bold('-- DRY RUN: SKIPPING COMMAND --'));
            toolOutput = { status: 'Dry run mode, command not executed.' };
        } else {
            toolOutput = await executeTool(name, args);
        }

        console.log(chalk.dim(`Result:\n${JSON.stringify(toolOutput, null, 2)}`));

        response = await chat.sendMessage(JSON.stringify({
            functionResponse: {
                name,
                response: { result: toolOutput },
            },
        }));
    }

    console.log(chalk.green.bold(`✅ Final Response:\n${response.response.text()}`));
}

async function executeTool(name, args) {
    const workingDirectory = process.cwd();

    function getSafePath(targetPath) {
        const workDir = path.resolve(workingDirectory);
        const resolvedTargetPath = path.resolve(workDir, targetPath);

        if (!resolvedTargetPath.startsWith(workDir)) {
            throw new Error(`Path access denied: '${targetPath}' is outside the project directory.`);
        }
        return resolvedTargetPath;
    }

    try {
        switch (name) {
            case 'run_git_command':
                return await new Promise((resolve) => {
                    exec(`git ${args.command}`, { cwd: workingDirectory }, (error, stdout, stderr) => {
                        resolve({ stdout, stderr, return_code: error ? error.code : 0 });
                    });
                });
            case 'list_files':
                const listPath = getSafePath(args.path);
                const files = await fs.readdir(listPath);
                return files.join('\n') || 'Directory is empty.';
            case 'read_file':
                const readPath = getSafePath(args.path);
                return await fs.readFile(readPath, 'utf-8');
            case 'write_file':
                const writePath = getSafePath(args.path);
                await fs.writeFile(writePath, args.content);
                return `Successfully wrote to '${args.path}'.`;
            case 'move_file':
                const sourcePath = getSafePath(args.source);
                const destPath = getSafePath(args.destination);
                await fs.rename(sourcePath, destPath);
                return `Successfully moved '${args.source}' to '${args.destination}'.`;
            case 'delete_file':
                const deletePath = getSafePath(args.path);
                await fs.unlink(deletePath);
                return `Successfully deleted file '${args.path}'.`;
            case 'create_directory':
                const createPath = getSafePath(args.path);
                await fs.mkdir(createPath, { recursive: true });
                return `Successfully created directory '${args.path}'.`;
            case 'delete_directory':
                const deleteDirPath = getSafePath(args.path);
                await fs.rm(deleteDirPath, { recursive: true, force: true });
                return `Successfully deleted directory '${args.path}' and all its contents.`;
            case 'list_directory_tree':
                const treePath = getSafePath(args.path);
                const tree = await listTree(treePath);
                return tree.join('\n');
            case 'read_directory_files':
                const readDirPath = getSafePath(args.path);
                const dirFiles = await fs.readdir(readDirPath);
                const fileContents = {};
                for (const file of dirFiles) {
                    const filePath = path.join(readDirPath, file);
                    const stat = await fs.stat(filePath);
                    if (stat.isFile()) {
                        fileContents[file] = await fs.readFile(filePath, 'utf-8');
                    }
                }
                return fileContents;
            case 'get_current_directory':
                return process.cwd();
            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (error) {
        return { error: error.message };
    }
}

async function listTree(dir) {
    const result = [];
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
        const res = path.resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            result.push(`${dirent.name}/`);
            result.push(...(await listTree(res)).map(f => `  ${f}`));
        }
        else {
            result.push(dirent.name);
        }
    }
    return result;
}

async function ensureGitRepository() {
    const isGitRepo = await new Promise((resolve) => {
        exec('git rev-parse --is-inside-work-tree', { cwd: process.cwd() }, (error, stdout) => {
            resolve(!error && stdout.trim() === 'true');
        });
    });

    if (isGitRepo) {
        return;
    }

    console.log(chalk.yellow.bold('This directory is not a git repository.'));
    
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const confirmInit = await new Promise((resolve) => {
        rl.question('Do you want to initialize a new git repository here? (y/n) ', (answer) => {
            resolve(answer.toLowerCase() === 'y');
        });
    });

    if (!confirmInit) {
        console.log(chalk.red.bold('Aborting. Git repository not initialized.'));
        rl.close();
        process.exit(1);
    }

    await new Promise((resolve, reject) => {
        exec('git init', { cwd: process.cwd() }, (error, stdout) => {
            if (error) {
                console.error(chalk.red.bold(`Error initializing repository: ${error.message}`));
                reject(error);
            } else {
                console.log(chalk.green('✓ Git repository initialized.'));
                console.log(stdout);
                resolve();
            }
        });
    });

    const remoteUrl = await new Promise((resolve) => {
        rl.question('Please enter the remote repository URL (or leave blank to skip): ', (url) => {
            resolve(url.trim());
        });
    });

    if (remoteUrl) {
        await new Promise((resolve, reject) => {
            exec(`git remote add origin "${remoteUrl}"`, { cwd: process.cwd() }, (error) => {
                if (error) {
                    console.error(chalk.red.bold(`Error adding remote: ${error.message}`));
                    reject(error);
                } else {
                    console.log(chalk.green('✓ Remote repository added as "origin".'));
                    resolve();
                }
            });
        });
    }

    rl.close();
}

async function runAutoCommit(dryRun) {
    await ensureGitRepository();
    console.log(chalk.cyan.bold('Staging all changes and generating commit message...'));

    await new Promise((resolve, reject) => {
        exec('git add .', (error) => {
            if (error) reject(error);
            else resolve();
        });
    });

    const diff = await new Promise((resolve, reject) => {
        exec('git diff --staged', (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });

    if (!diff) {
        console.log('No staged changes to commit.');
        return;
    }

    const genAI = new GoogleGenerativeAI(await getApiKey());
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Based on the following git diff, generate a concise and descriptive commit message following the Conventional Commits specification:\n\n${diff}. Don't use any inline code formatting. Do not ask any further questions. Just provide the commit message.`;
    const result = await model.generateContent(prompt);
    let commitMessage = result.response.text().trim();

    if (commitMessage.startsWith('```') && commitMessage.endsWith('```')) {
        commitMessage = commitMessage.slice(3, -3).trim();
    }

    await runManualCommit(commitMessage, dryRun);
}

async function runManualCommit(commitMessage, dryRun) {
    await ensureGitRepository();
    console.log(chalk.green.bold(`Commit Message:\n${commitMessage}`));

    if (dryRun) {
        console.log(chalk.magenta.bold('-- DRY RUN: Staging changes but not committing or pushing. --'));
        await new Promise((resolve, reject) => {
            exec('git add .', (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
        return;
    }

    try {
        await new Promise((resolve, reject) => {
            exec('git add .', (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
        await new Promise((resolve, reject) => {
            exec(`git commit -m "${commitMessage.replace(/"/g, '\"')}"`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
        console.log(chalk.green('✓ Commit successful.'));

        const currentBranch = await new Promise((resolve, reject) => {
            exec('git branch --show-current', (error, stdout) => {
                if (error) reject(error);
                else resolve(stdout.trim());
            });
        });

        console.log(`Pushing to origin/${currentBranch}...`);
        await new Promise((resolve, reject) => {
            exec(`git push origin ${currentBranch}`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
        console.log(chalk.green('✓ Push successful.'));
    } catch (error) {
        console.log(chalk.red.bold(`Error during git operation:\n${error.stderr}`));
    }
}

async function checkForUpdates() {
    console.log(chalk.cyan.bold('Checking for updates...'));
    const upgraded = await ncu.run({
        packageFile: new URL('../package.json', import.meta.url).pathname,
        upgrade: true,
        jsonUpgraded: true
    });

    if (Object.keys(upgraded).length > 0) {
        console.log(chalk.green.bold('A new version is available!'));
        console.log(chalk.blue('To upgrade, run:'));
        console.log(chalk.blue('  npm install -g git-flash-js@latest'));
    } else {
        console.log(chalk.green.bold('You are already using the latest version.'));
    }
}

program
    .version(JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url))).version, '-v, --version', 'display the version number')
    .name('git-flash')
    .description('An AI assistant for git and file system operations.')
    .argument('[instruction]', 'The natural language instruction for the git agent.')
    .option('-m, --message <message>', 'A specific commit message to use.')
    .option('--dry-run', 'Perform a dry run.')
    .option('-u, --update', 'Check for updates.')
    .action(async (instruction, options) => {
        if (options.update) {
            await checkForUpdates();
        } else if (instruction) {
            await runGenerativeGitFlow(instruction, options.dryRun);
        } else if (options.message) {
            await runManualCommit(options.message, options.dryRun);
        } else {
            await runAutoCommit(options.dryRun);
        }
    });

program.parse(process.argv);

