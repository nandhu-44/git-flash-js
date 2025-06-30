import { readFileSync } from 'fs';
import chalk from 'chalk';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const { version } = packageJson;

console.clear();
console.log(chalk.green(`git-flash version ${version} installed successfully!`));
console.log('');
console.log(chalk.blue('Usage:'));
console.log(chalk.blue('  git-flash "your commit message"'));
console.log(chalk.blue('  git-flash --update'));
console.log('');
