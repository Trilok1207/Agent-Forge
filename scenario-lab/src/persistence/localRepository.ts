import { appConfig } from '@/config/app';
import type { Project } from '@/core/project';
import { log } from '@/core/log';
import { StorageError, type LoadFailure, type ProjectRepository } from './repository';
import { parseProject, serializeProject } from './serialization';

const ns = appConfig.storageNamespace;
const INDEX_KEY = `${ns}.v1.index`;
const projectKey = (id: string) => `${ns}.v1.project.${id}`;

function storage(): Storage {
  try {
    const s = window.localStorage;
    if (!s) throw new Error('missing');
    return s;
  } catch {
    throw new StorageError('Browser storage is unavailable. Projects cannot be saved in this browser mode (for example, some private windows).');
  }
}

function readIndex(s: Storage): string[] {
  try {
    const parsed: unknown = JSON.parse(s.getItem(INDEX_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(s: Storage, ids: string[]) {
  s.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)]));
}

function setItem(s: Storage, key: string, value: string) {
  try {
    s.setItem(key, value);
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    throw new StorageError(
      quota
        ? 'Browser storage is full. Delete old projects or runs, or export them, and try again.'
        : 'The project could not be saved to browser storage.',
    );
  }
}

/** Projects stored in this browser's localStorage, one key per project. */
export class LocalProjectRepository implements ProjectRepository {
  async list() {
    const s = storage();
    const projects: Project[] = [];
    const failures: LoadFailure[] = [];
    for (const id of readIndex(s)) {
      const raw = s.getItem(projectKey(id));
      if (raw === null) continue;
      const result = this.parse(raw);
      if (result.ok) projects.push(result.project);
      else {
        failures.push({ id, reason: result.reason });
        log.warn('project.load_failed', { projectId: id });
      }
    }
    return { projects, failures };
  }

  async get(id: string) {
    const raw = storage().getItem(projectKey(id));
    if (raw === null) return null;
    const result = this.parse(raw);
    if (!result.ok) throw new StorageError(`This project could not be opened: ${result.reason}`);
    return result.project;
  }

  async save(project: Project) {
    const s = storage();
    setItem(s, projectKey(project.id), serializeProject(project));
    writeIndex(s, [...readIndex(s), project.id]);
  }

  async delete(id: string) {
    const s = storage();
    s.removeItem(projectKey(id));
    writeIndex(s, readIndex(s).filter((x) => x !== id));
  }

  private parse(raw: string): { ok: true; project: Project } | { ok: false; reason: string } {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'the saved data is not valid JSON' };
    }
    const result = parseProject(json);
    if (result.ok) return result;
    const first = result.issues[0];
    return { ok: false, reason: first ? `${first.path}: ${first.message}` : 'the saved data is invalid' };
  }
}
