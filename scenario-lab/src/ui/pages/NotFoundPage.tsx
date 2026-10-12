import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        title="Page not found"
        actions={
          <Link className="btn btn--primary" to="/">
            Back to projects
          </Link>
        }
      >
        The address may be mistyped, or the page has moved.
      </EmptyState>
    </div>
  );
}
