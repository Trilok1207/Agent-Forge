import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDateTime } from '@/core/format';
import type { Project } from '@/core/project';
import { VALUE_SOURCE_INFO, type ValueSource } from '@/core/provenance';
import { hasErrors, type ValidationIssue } from '@/core/validation';
import { getDomain } from '@/domains/registry';
import { SUCCESS_METRIC_LABELS } from '@/domains/warehouse/labels';
import type { WarehouseModel } from '@/domains/warehouse/schema';
import { useNotify } from '@/state/NotificationsContext';
import { useProjects } from '@/state/ProjectsContext';
import { Disclaimer } from '../components/Disclaimer';
import { EmptyState } from '../components/EmptyState';
import { SourceBadge } from '../components/SourceBadge';

export function ProjectPage() {
  const { projectId } = useParams();
  const { status, projects } = useProjects();

  if (status === 'loading') {
    return (
      <p className="page muted" role="status">
        Loading project…
      </p>
    );
  }
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="page">
        <EmptyState
          title="Project not found"
          actions={
            <Link className="btn btn--primary" to="/">
              Back to projects
            </Link>
          }
        >
          It may have been deleted, or it was saved in a different browser.
        </EmptyState>
      </div>
    );
  }
  return <ProjectOverview project={project} />;
}

function ProjectOverview({ project }: { project: Project }) {
  const domain = getDomain(project.domainId);
  const issues = useMemo(() => (domain ? domain.validateModel(project.model) : []), [domain, project.model]);
  const sections = useMemo(() => (domain ? domain.summarize(project.model) : []), [domain, project.model]);

  if (!domain) {
    return (
      <div className="page panel panel--error" role="alert">
        This project uses an unsupported type ({project.domainId}).
      </div>
    );
  }

  const model = project.model as WarehouseModel;

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/">Projects</Link> <span aria-hidden="true">/</span> <span aria-current="page">{project.name}</span>
      </nav>

      <ProjectHeader project={project} domainLabel={domain.label} />

      <div className="grid-2">
        <ValidationPanel issues={issues} />
        <section className="panel" aria-labelledby="meta-title">
          <h2 id="meta-title">Project record</h2>
          <dl className="kv">
            <dt>Model version</dt>
            <dd>
              <code>{domain.modelVersion}</code>
            </dd>
            <dt>Baseline revision</dt>
            <dd>{project.modelRevision}</dd>
            <dt>Created</dt>
            <dd>{formatDateTime(project.createdAt)}</dd>
            <dt>Last edited</dt>
            <dd>{formatDateTime(project.updatedAt)}</dd>
            <dt>Scenarios</dt>
            <dd>{project.scenarios.length}</dd>
            <dt>Simulation runs</dt>
            <dd>{project.runs.length}</dd>
          </dl>
        </section>
      </div>

      <section className="section" aria-labelledby="model-title">
        <div className="section__head">
          <h2 id="model-title">Baseline model</h2>
          <SourceLegend />
        </div>
        <div className="cards">
          {sections.map((s) => (
            <section key={s.title} className="panel" aria-label={s.title}>
              <h3>{s.title}</h3>
              <dl className="kv kv--wide">
                {s.items.map((item) => (
                  <div key={item.label} className="kv__row">
                    <dt>
                      {item.label}
                      {item.help && <span className="help">{item.help}</span>}
                    </dt>
                    <dd>
                      <span className={item.value === 'Unknown' ? 'value--unknown' : undefined}>{item.value}</span>
                      {item.source && <SourceBadge source={item.source} />}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="goals-title">
          <h2 id="goals-title">Goals and constraints</h2>
          {model.goals.successCriteria.length === 0 && model.goals.constraints.length === 0 ? (
            <p className="muted">No success criteria recorded yet.</p>
          ) : (
            <ul className="list">
              {model.goals.successCriteria.map((c) => {
                const m = SUCCESS_METRIC_LABELS[c.metric];
                return (
                  <li key={c.id}>
                    {m.label} {c.comparator === 'at_least' ? 'at least' : 'at most'}{' '}
                    <strong>
                      {c.target} {m.unit}
                    </strong>
                  </li>
                );
              })}
              {model.goals.constraints.map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel" aria-labelledby="assumptions-title">
          <h2 id="assumptions-title">Recorded assumptions</h2>
          {model.assumptions.length === 0 ? (
            <p className="muted">No additional assumptions recorded yet.</p>
          ) : (
            <ul className="list">
              {model.assumptions.map((a) => (
                <li key={a.id}>
                  {a.statement} <SourceBadge source={a.source} />
                  {a.reference && <span className="muted"> — {a.reference}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Disclaimer />
    </div>
  );
}

function ProjectHeader({ project, domainLabel }: { project: Project; domainLabel: string }) {
  const { update } = useProjects();
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a project name.');
    try {
      await update(project.id, (p) => ({ ...p, name: trimmed, description: description.trim() }));
      setEditing(false);
      notify('Project details saved.', 'success');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (editing) {
    return (
      <form className="panel form" onSubmit={(e) => void save(e)} noValidate aria-label="Edit project details">
        <div className="field">
          <label htmlFor="pd-name">Project name</label>
          <input
            id="pd-name"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pd-error' : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="pd-desc">Purpose / decision being explored</label>
          <textarea id="pd-desc" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && (
          <p id="pd-error" className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="btn btn--primary">
            Save
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setName(project.name);
              setDescription(project.description);
              setError(null);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <header className="project-header">
      <div>
        <h1>
          {project.name}
          {project.isSample && <span className="tag">Sample</span>}
        </h1>
        <p className="muted">{domainLabel}</p>
        {project.description && <p className="project-header__desc">{project.description}</p>}
      </div>
      <button type="button" className="btn" onClick={() => setEditing(true)}>
        Edit details
      </button>
    </header>
  );
}

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const ready = !hasErrors(issues);
  return (
    <section className={`panel ${ready ? 'panel--ok' : 'panel--warning'}`} aria-labelledby="check-title">
      <h2 id="check-title">Model check</h2>
      <p>
        {ready
          ? 'The baseline model is complete enough to simulate.'
          : `${errors.length} ${errors.length === 1 ? 'item needs' : 'items need'} attention before this model can be simulated.`}
      </p>
      {issues.length > 0 && (
        <ul className="issues">
          {[...errors, ...warnings].map((i, n) => (
            <li key={n} className={`issue issue--${i.severity}`}>
              <span className="issue__kind">{i.severity === 'error' ? 'Required' : 'Check'}</span> {i.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SourceLegend() {
  const sources = Object.keys(VALUE_SOURCE_INFO) as ValueSource[];
  return (
    <details className="legend">
      <summary>What do the value labels mean?</summary>
      <dl>
        {sources.map((s) => (
          <div key={s} className="legend__row">
            <dt>
              <SourceBadge source={s} />
            </dt>
            <dd>{VALUE_SOURCE_INFO[s].description}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
