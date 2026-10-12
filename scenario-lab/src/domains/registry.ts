import type { DomainDefinition } from '@/core/domain';
import { warehouseDomain } from './warehouse';

/** All simulation domains the app knows about. Add new domains here. */
const domains: DomainDefinition<any>[] = [warehouseDomain]; // eslint-disable-line @typescript-eslint/no-explicit-any

export const DEFAULT_DOMAIN_ID = warehouseDomain.id;

export function getDomain(id: string): DomainDefinition<unknown> | undefined {
  return domains.find((d) => d.id === id);
}

export function listDomains(): readonly DomainDefinition<unknown>[] {
  return domains;
}
