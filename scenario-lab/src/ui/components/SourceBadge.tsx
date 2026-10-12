import { VALUE_SOURCE_INFO, type ValueSource } from '@/core/provenance';

/** Shows where a value came from (your data, assumption, default, AI, unknown). */
export function SourceBadge({ source }: { source: ValueSource }) {
  const info = VALUE_SOURCE_INFO[source];
  return (
    <span className={`badge badge--${source}`} title={info.description}>
      {info.label}
    </span>
  );
}
