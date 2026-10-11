import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validatePreviewFiles } from '../scripts/validate-pr-preview.mjs';

async function previewDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metriq-preview-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'index.html'), '<html>Preview</html>');
  return directory;
}

test('accepts a static site and optional .nojekyll without executing JavaScript', async (t) => {
  const directory = await previewDirectory(t);
  await mkdir(path.join(directory, 'public'));
  await writeFile(path.join(directory, 'public', 'main.js'), 'throw new Error("Do not execute");');
  await writeFile(path.join(directory, '.nojekyll'), '');
  await validatePreviewFiles(directory);
});

test('rejects hidden Git metadata anywhere in a preview', async (t) => {
  for (const name of ['.git', '.github', '.gitattributes', '.gitmodules']) {
    const directory = await previewDirectory(t);
    await mkdir(path.join(directory, 'public'));
    await writeFile(path.join(directory, 'public', name), 'untrusted');
    await assert.rejects(validatePreviewFiles(directory), /hidden files/);
  }
});

test('rejects symlinks instead of copying files outside the artifact', async (t) => {
  const directory = await previewDirectory(t);
  await symlink(os.tmpdir(), path.join(directory, 'escape'));
  await assert.rejects(validatePreviewFiles(directory), /symlinks/);
});

test('requires a regular index.html file', async (t) => {
  const directory = await previewDirectory(t);
  await rm(path.join(directory, 'index.html'));
  await assert.rejects(validatePreviewFiles(directory), { code: 'ENOENT' });
  await mkdir(path.join(directory, 'index.html'));
  await assert.rejects(validatePreviewFiles(directory), /index.html file/);
});
