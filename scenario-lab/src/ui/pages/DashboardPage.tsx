import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { appConfig } from '@/config/app';
import { formatDateTime } from '@/core/format';
import { summarizeProject, type Project, type ProjectSummary } from '@/core/project';
import { createBlankProject, createSampleProject, duplicateProject } from '@/core/projectFactory';
import { DEFAULT_DOMAIN_ID, getDomain, listDomains } from '@/domains/registry';
import { useNotify } from '@/state/NotificationsContext';
import { useProjects } from '@/state/ProjectsContext';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Disclaimer } from '../components/Disclaimer';
import { EmptyState } from '../components/EmptyState';

const RUN_STATUS_LABELS: Record<ProjectSummary['latestRunStatus'], string> = {
  never_run: 'Not simulated yet',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function DashboardPage() {
  const { status, error, projects, failures, reload, add, remove } = useProjects();
  const notify = useNotify();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const summaries = projects.map(summarizeProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  async function openSample() {
    const domain = getDomain(DEFAULT_DOMAIN_ID)!;
    const project = createSampleProject(domain);
    try {
      await add(project);
      navigate(`/projects/${project.id}`);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function duplicate(p: Project) {
    try {
      const copy = duplicateProject(p);
      await add(copy);
      notify(`Created “${copy.name}”. Run history was not copied.`, 'success');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await remove(pendingDelete.id);
      notify(`Deleted “${pendingDelete.name}”.`, 'success');
      setPendingDelete(null);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <section className="intro" aria-labelledby="intro-title">
        <h1 id="intro-title">Explore “what if?” decisions for your warehouse</h1>
        <p className="intro__lead">
          {appConfig.name} lets you describe a warehouse, change assumptions such as staffing, robots or order volume, and
          compare how each option might play out. Every number comes from an explicit, reproducible simulation of the
          inputs you can inspect — nothing is guessed.
        </p>
        <ol className="intro__steps">
          <li>
            <strong>Describe</strong> the building, orders and people or robots.
          </li>
          <li>
            <strong>Simulate</strong> a normal shift as your baseline.
          </li>
          <li>
            <strong>Compare</strong> scenarios side by side and see the trade-offs.
          </li>
        </ol>
        <div className="intro__actions">
          <button type="button" className="btn btn--primary" onClick={openSample}>
            Open the sample warehouse
          </button>
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            Start a new project
          </button>
        </div>
        <Disclaimer compact />
      </section>

      <section aria-labelledby="projects-title" className="section">
        <div className="section__head">
          <h2 id="projects-title">Your projects</h2>
          <span className="muted">Saved in this browser only.</span>
        </div>

        {status === 'loading' && (
          <p className="muted" role="status">
            Loading projects…
          </p>
        )}

        {status === 'error' && (
          <div className="panel panel--error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && failures.length > 0 && (
          <div className="panel panel--warning" role="alert">
            <p>
              {failures.length === 1 ? 'One saved project' : `${failures.length} saved projects`} could not be opened
              because the stored data is damaged or from an unsupported version.
            </p>
            <ul>
              {failures.map((f) => (
                <li key={f.id}>
                  <code>{f.id}</code> — {f.reason}{' '}
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => setPendingDelete({ id: f.id, name: f.id })}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === 'ready' && summaries.length === 0 && (
          <EmptyState
            title="No projects yet"
            actions={
              <>
                <button type="button" className="btn btn--primary" onClick={openSample}>
                  Open the sample warehouse
                </button>
                <button type="button" className="btn" onClick={() => setCreating(true)}>
                  Start a new project
                </button>
              </>
            }
          >
            The sample is the quickest way to see how it works. You can change anything in it.
          </EmptyState>
        )}

        {status === 'ready' && summaries.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Saved projects</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Last edited</th>
                  <th scope="col">Latest simulation</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  const project = projects.find((p) => p.id === s.id)!;
                  return (
                    <tr key={s.id}>
                      <th scope="row">
                        <Link to={`/projects/${s.id}`}>{s.name}</Link>
                        {s.isSample && <span className="tag">Sample</span>}
                      </th>
                      <td>{getDomain(s.domainId)?.label ?? s.domainId}</td>
                      <td>{formatDateTime(s.updatedAt)}</td>
                      <td>
                        <span className={`status status--${s.latestRunStatus}`}>{RUN_STATUS_LABELS[s.latestRunStatus]}</span>
                      </td>
                      <td className="table__actions">
                        <Link className="btn btn--sm" to={`/projects/${s.id}`} aria-label={`Open ${s.name}`}>
                          Open
                        </Link>
                        <button type="button" className="btn btn--sm" onClick={() => void duplicate(project)} aria-label={`Duplicate ${s.name}`}>
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger-ghost"
                          onClick={() => setPendingDelete({ id: s.id, name: s.name })}
                          aria-label={`Delete ${s.name}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (name, description, domainId) => {
          const project = createBlankProject(getDomain(domainId)!, name, description);
          await add(project);
          setCreating(false);
          navigate(`/projects/${project.id}`);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete project?"
        message={
          <p>
            “{pendingDelete?.name}” and all its scenarios and simulation runs will be permanently removed from this browser.
            This cannot be undone.
          </p>
        }
        confirmLabel="Delete project"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function NewProjectDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose(): void;
  onCreate(name: string, description: string, domainId: string): Promise<void>;
}) {
  const domains = listDomains();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domainId, setDomainId] = useState(DEFAULT_DOMAIN_ID);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setName('');
    setDescription('');
    setNameError(null);
    setSubmitError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNameError('Enter a project name.');
    if (trimmed.length > 80) return setNameError('Use 80 characters or fewer.');
    setBusy(true);
    try {
      await onCreate(trimmed, description.trim(), domainId);
      reset();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Start a new project"
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="form">
        <div className="field">
          <label htmlFor="np-name">Project name</label>
          <input
            id="np-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'np-name-error' : undefined}
            maxLength={80}
            autoFocus
            required
          />
          {nameError && (
            <p id="np-name-error" className="field__error">
              {nameError}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="np-desc">What decision are you exploring? (optional)</label>
          <textarea
            id="np-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="For example: Do we need a third packing station for peak season?"
          />
        </div>
        {domains.length > 1 && (
          <div className="field">
            <label htmlFor="np-domain">Project type</label>
            <select id="np-domain" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="muted">
          The project starts as an empty {getDomain(domainId)?.label.toLowerCase()} model. Values the app can't guess — such as
          order volume and staffing — are marked <em>Unknown</em> until you fill them in.
        </p>
        {submitError && (
          <p className="field__error" role="alert">
            {submitError}
          </p>
        )}
        <div className="dialog__footer">
          <button
            type="button"
            className="btn"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
