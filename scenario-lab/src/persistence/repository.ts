import type { Project } from '@/core/project';

export interface LoadFailure {
  id: string;
  reason: string;
}

/**
 * Storage boundary for projects. The first release uses browser storage
 * (`LocalProjectRepository`); a server-backed implementation can replace it
 * later without changing the UI, provided it enforces authorization itself.
 */
export interface ProjectRepository {
  list(): Promise<{ projects: Project[]; failures: LoadFailure[] }>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}
