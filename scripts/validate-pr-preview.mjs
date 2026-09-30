import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

// Artifact contents are static files only; never import or execute them.
// Reject Git metadata before a deployment action copies files into gh-pages.
export async function validatePreviewFiles(directory) {
  async function visit(current) {
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Preview artifacts must not contain symlinks');
    if (stat.isDirectory()) {
      for (const name of await readdir(current)) {
        if (name.startsWith('.') && !(current === directory && name === '.nojekyll')) {
          throw new Error('Preview artifacts must not contain hidden files or directories');
        }
        await visit(path.join(current, name));
      }
    } else if (!stat.isFile()) {
      throw new Error('Preview artifacts must contain only regular files and directories');
    }
  }

  await visit(directory);
  if (!(await lstat(path.join(directory, 'index.html'))).isFile()) {
    throw new Error('Preview artifacts must contain an index.html file');
  }
}
