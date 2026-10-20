/**
 * In-memory hand-off of files picked on another screen (Tareas, Apuntes) to the
 * chat composer. Never persisted: no storage, no service worker, lost on reload.
 */
let pending: File[] = [];

export function setPendingFiles(files: File[]) {
  pending = files.slice(0, 4);
}

export function takePendingFiles() {
  const files = pending;
  pending = [];
  return files;
}
