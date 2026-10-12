import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Project } from '@/core/project';
import { log } from '@/core/log';
import { getDomain } from '@/domains/registry';
import { LocalProjectRepository } from '@/persistence/localRepository';
import { StorageError, type LoadFailure, type ProjectRepository } from '@/persistence/repository';

type Status = 'loading' | 'ready' | 'error';

interface ProjectsContextValue {
  status: Status;
  error: string | null;
  projects: Project[];
  failures: LoadFailure[];
  reload(): Promise<void>;
  add(project: Project): Promise<void>;
  /** Apply a change to project metadata/scenarios/runs. Sets `updatedAt`. */
  update(id: string, change: (p: Project) => Project): Promise<void>;
  /** Replace the baseline model after validating it; bumps `modelRevision`. */
  updateModel(id: string, model: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

function messageOf(e: unknown): string {
  return e instanceof StorageError ? e.message : 'Something went wrong while accessing saved projects.';
}

export function ProjectsProvider({ children, repository }: { children: ReactNode; repository?: ProjectRepository }) {
  const repo = useMemo(() => repository ?? new LocalProjectRepository(), [repository]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [failures, setFailures] = useState<LoadFailure[]>([]);

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await repo.list();
      setProjects(result.projects);
      setFailures(result.failures);
      setError(null);
      setStatus('ready');
    } catch (e) {
      log.error('projects.list_failed');
      setError(messageOf(e));
      setStatus('error');
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persist = useCallback(
    async (project: Project) => {
      try {
        await repo.save(project);
      } catch (e) {
        log.error('project.save_failed', { projectId: project.id });
        throw new StorageError(messageOf(e));
      }
      setProjects((list) => {
        const i = list.findIndex((p) => p.id === project.id);
        return i === -1 ? [...list, project] : list.map((p) => (p.id === project.id ? project : p));
      });
    },
    [repo],
  );

  const value = useMemo<ProjectsContextValue>(() => {
    const find = (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (!p) throw new StorageError('That project no longer exists.');
      return p;
    };
    return {
      status,
      error,
      projects,
      failures,
      reload,
      add: async (project) => {
        await persist(project);
        log.info('project.created', { projectId: project.id, domain: project.domainId, sample: project.isSample });
      },
      update: async (id, change) => {
        const next = { ...change(find(id)), id, updatedAt: new Date().toISOString() };
        await persist(next);
      },
      updateModel: async (id, model) => {
        const current = find(id);
        const domain = getDomain(current.domainId);
        if (!domain) throw new StorageError('This project type is not supported.');
        const parsed = domain.modelSchema.safeParse(model);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          throw new StorageError(`The model change is invalid${first ? `: ${first.path.join('.')} – ${first.message}` : '.'}`);
        }
        await persist({
          ...current,
          model: parsed.data,
          modelRevision: current.modelRevision + 1,
          updatedAt: new Date().toISOString(),
        });
      },
      remove: async (id) => {
        try {
          await repo.delete(id);
        } catch (e) {
          throw new StorageError(messageOf(e));
        }
        setProjects((list) => list.filter((p) => p.id !== id));
        setFailures((list) => list.filter((f) => f.id !== id));
        log.info('project.deleted', { projectId: id });
      },
    };
  }, [status, error, projects, failures, reload, persist, repo]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used inside ProjectsProvider');
  return ctx;
}
