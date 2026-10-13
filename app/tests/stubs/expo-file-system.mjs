// Stand-in for expo-file-system in the unit tests: folders are paths in globalThis.__testFolders (a Set the
// test fills); delete() removes the path and records it in globalThis.__testDeleted.

const folders = () => (globalThis.__testFolders ??= new Set());
const deleted = () => (globalThis.__testDeleted ??= []);

export const Paths = { cache: 'cache', document: 'document' };

function pathOf(parent, name) {
  const base = typeof parent === 'string' ? parent : parent.path;
  return name ? `${base}/${name}` : base;
}

export class Directory {
  constructor(parent, name) {
    this.path = pathOf(parent, name);
  }
  get exists() {
    return folders().has(this.path);
  }
  create() {
    folders().add(this.path);
  }
  delete() {
    if (globalThis.__testLocked?.has(this.path)) throw new Error('file in use');
    folders().delete(this.path);
    deleted().push(this.path);
  }
}

export class File {
  constructor(parent, name) {
    this.path = pathOf(parent, name);
    this.uri = `file:///${this.path}`;
  }
  get exists() {
    return false;
  }
}