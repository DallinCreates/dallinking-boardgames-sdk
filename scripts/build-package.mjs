#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');
const tscBin = path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, 'package.json');

if (!fs.existsSync(tscBin)) {
  throw new Error(`TypeScript compiler not found at ${tscBin}. Run npm install first.`);
}

if (!fs.existsSync(packageJsonPath)) {
  throw new Error(`package.json not found in ${packageDir}`);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageName = packageJson.name;

const buildConfigs = {
  '@dallincreates/boardgame-client': {
    publicTypes: ['src/index.d.ts'],
  },
  '@dallincreates/boardgame-devkit': {
    publicTypes: ['src/index.d.ts'],
  },
  '@dallincreates/create-dallinking-boardgame': {
    publicTypes: ['src/index.d.ts'],
  },
};

const buildConfig = buildConfigs[packageName];

if (!buildConfig) {
  console.log(`Skipping ${packageName}: no build configuration available.`);
  process.exit(0);
}

const distDir = path.join(packageDir, 'dist');
const tempRoot = path.join(packageDir, '.build-temp');

function runTsc(moduleKind, outDir) {
  execFileSync(
    process.execPath,
    [
      tscBin,
      '-p',
      'tsconfig.build.json',
      '--module',
      moduleKind,
      '--outDir',
      outDir,
    ],
    {
      cwd: packageDir,
      stdio: 'inherit',
    }
  );
}

function listFiles(rootDir) {
  const results = [];

  if (!fs.existsSync(rootDir)) {
    return results;
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFiles(entryPath));
      continue;
    }

    results.push(entryPath);
  }

  return results;
}

function ensureCleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function rewriteModuleSpecifiers(content, emittedRelativePaths, targetExtension, relativeFromDir) {
  let rewritten = content;

  for (const relativePath of emittedRelativePaths) {
    const targetPath = relativePath.split(path.sep).join('/');
    const sourceSpecifier = `./${path.posix.relative(relativeFromDir.split(path.sep).join('/'), targetPath)}`;
    const normalizedSourceSpecifier = sourceSpecifier.startsWith('./') || sourceSpecifier.startsWith('../')
      ? sourceSpecifier
      : `./${sourceSpecifier}`;
    const targetSpecifier = normalizedSourceSpecifier.replace(/\.js$/, `.${targetExtension}`);

    rewritten = rewritten.split(`"${normalizedSourceSpecifier}"`).join(`"${targetSpecifier}"`);
    rewritten = rewritten.split(`'${normalizedSourceSpecifier}'`).join(`'${targetSpecifier}'`);
  }

  return rewritten;
}

function emitFormat(moduleKind, targetExtension, tempDir) {
  runTsc(moduleKind, tempDir);

  const emittedFiles = listFiles(tempDir).filter((filePath) => filePath.endsWith('.js'));
  const emittedRelativePaths = emittedFiles.map((filePath) => path.relative(tempDir, filePath));

  for (const emittedFile of emittedFiles) {
    const relativePath = path.relative(tempDir, emittedFile);
    const targetFile = path.join(distDir, relativePath).replace(/\.js$/, `.${targetExtension}`);
    const targetDirectory = path.dirname(targetFile);
    fs.mkdirSync(targetDirectory, { recursive: true });

    const fileContent = fs.readFileSync(emittedFile, 'utf8');
    const rewrittenContent = rewriteModuleSpecifiers(
      fileContent,
      emittedRelativePaths,
      targetExtension,
      path.relative(tempDir, path.dirname(emittedFile))
    );
    fs.writeFileSync(targetFile, rewrittenContent, 'utf8');
  }
}

function copyPublicTypes() {
  for (const relativeTypePath of buildConfig.publicTypes) {
    const sourcePath = path.join(packageDir, relativeTypePath);
    const targetPath = path.join(distDir, relativeTypePath.replace(/^src[\/]/, ''));

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing public type declaration: ${sourcePath}`);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

ensureCleanDir(distDir);
ensureCleanDir(tempRoot);

emitFormat('CommonJS', 'cjs', path.join(tempRoot, 'cjs'));
emitFormat('ESNext', 'mjs', path.join(tempRoot, 'esm'));
copyPublicTypes();

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log(`Built ${packageName}`);