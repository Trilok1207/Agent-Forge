import type { Param } from '@/core/provenance';
import type { ValidationIssue } from '@/core/validation';
import { buildGraph, shortestDistances } from './graph';
import type { WarehouseModel } from './schema';

interface Box {
  x: number;
  y: number;
  width: number;
  depth: number;
}

const EPS = 1e-6;

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - EPS &&
    b.x < a.x + a.width - EPS &&
    a.y < b.y + b.depth - EPS &&
    b.y < a.y + a.depth - EPS
  );
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.width <= outer.x + outer.width + EPS &&
    inner.y + inner.depth <= outer.y + outer.depth + EPS
  );
}

/** True if the segment passes through the open interior of the box (Liang–Barsky). */
function segmentCrossesBox(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  const minX = b.x + EPS;
  const maxX = b.x + b.width - EPS;
  const minY = b.y + EPS;
  const maxY = b.y + b.depth - EPS;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x1 - minX) && clip(dx, maxX - x1) && clip(-dy, y1 - minY) && clip(dy, maxY - y1) && t1 - t0 > EPS;
}

/**
 * Semantic validation of a schema-valid warehouse model. Errors block a
 * simulation run; warnings are shown but do not block it.
 */
export function validateWarehouseModel(model: WarehouseModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) => issues.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ severity: 'warning', path, message });

  const { layout, operations: ops } = model;
  const building: Box = { x: 0, y: 0, width: layout.width, depth: layout.depth };

  // --- Identifiers and references -----------------------------------------
  const seen = new Set<string>();
  const allIds = [
    ...layout.nodes.map((o) => ['layout.nodes', o.id] as const),
    ...layout.edges.map((o) => ['layout.edges', o.id] as const),
    ...layout.zones.map((o) => ['layout.zones', o.id] as const),
    ...layout.locations.map((o) => ['layout.locations', o.id] as const),
    ...layout.packingStations.map((o) => ['layout.packingStations', o.id] as const),
    ...layout.docks.map((o) => ['layout.docks', o.id] as const),
  ];
  for (const [path, oid] of allIds) {
    if (seen.has(oid)) error(path, `The id "${oid}" is used more than once. Every object needs a unique id.`);
    seen.add(oid);
  }

  const nodeIds = new Set(layout.nodes.map((n) => n.id));
  const zoneIds = new Set(layout.zones.map((z) => z.id));

  for (const e of layout.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
      error('layout.edges', `Walkway "${e.id}" connects to a path point that does not exist.`);
    } else if (e.from === e.to) {
      warn('layout.edges', `Walkway "${e.id}" starts and ends at the same point.`);
    }
  }

  for (const n of layout.nodes) {
    if (n.x < -EPS || n.y < -EPS || n.x > layout.width + EPS || n.y > layout.depth + EPS) {
      error('layout.nodes', `Path point "${n.id}" is outside the building.`);
    }
  }

  // --- Objects: boundary, overlap, access ---------------------------------
  const solids = [
    ...layout.locations.map((o) => ({ kind: 'Storage location', name: o.label, path: 'layout.locations', box: o as Box, access: o.accessNodeId })),
    ...layout.packingStations.map((o) => ({ kind: 'Packing station', name: o.name, path: 'layout.packingStations', box: o as Box, access: o.accessNodeId })),
    ...layout.docks.map((o) => ({ kind: 'Dock', name: o.name, path: 'layout.docks', box: o as Box, access: o.accessNodeId })),
  ];

  for (const s of solids) {
    if (!inside(s.box, building)) error(s.path, `${s.kind} "${s.name}" extends outside the building.`);
    if (!nodeIds.has(s.access)) error(s.path, `${s.kind} "${s.name}" has no valid access point on the walkways.`);
  }
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!;
      const b = solids[j]!;
      if (overlaps(a.box, b.box)) error(a.path, `${a.kind} "${a.name}" overlaps ${b.kind.toLowerCase()} "${b.name}".`);
    }
  }

  for (const z of layout.zones) {
    if (!inside(z, building)) error('layout.zones', `Zone "${z.name}" extends outside the building.`);
  }
  for (let i = 0; i < layout.zones.length; i++) {
    for (let j = i + 1; j < layout.zones.length; j++) {
      const a = layout.zones[i]!;
      const b = layout.zones[j]!;
      if (overlaps(a, b)) warn('layout.zones', `Zones "${a.name}" and "${b.name}" overlap.`);
    }
  }

  for (const loc of layout.locations) {
    const zone = layout.zones.find((z) => z.id === loc.zoneId);
    if (!zone) error('layout.locations', `Storage location "${loc.label}" belongs to a zone that does not exist.`);
    else if (!inside(loc, zone)) warn('layout.locations', `Storage location "${loc.label}" lies partly outside its zone "${zone.name}".`);
  }

  const positions = new Map(layout.nodes.map((n) => [n.id, n]));
  for (const e of layout.edges) {
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    if (!a || !b) continue;
    const blocked = solids.find((s) => segmentCrossesBox(a.x, a.y, b.x, b.y, s.box));
    if (blocked) warn('layout.edges', `Walkway "${e.id}" passes through ${blocked.kind.toLowerCase()} "${blocked.name}".`);
  }

  // --- Required facilities --------------------------------------------------
  if (layout.locations.length === 0) error('layout.locations', 'Add at least one storage location so there is something to pick.');
  if (layout.packingStations.length === 0) error('layout.packingStations', 'Add at least one packing station.');
  if (!layout.docks.some((d) => d.kind === 'outbound')) {
    warn('layout.docks', 'There is no shipping (outbound) dock. Shipping is not simulated yet, but the layout is incomplete.');
  }

  // --- Reachability -----------------------------------------------------
  const startNode = layout.packingStations.find((p) => nodeIds.has(p.accessNodeId))?.accessNodeId;
  if (startNode) {
    const reach = shortestDistances(buildGraph(layout), startNode);
    const unreachable = solids.filter((s) => nodeIds.has(s.access) && !reach.has(s.access));
    const byKind = new Map<string, typeof unreachable>();
    for (const s of unreachable) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s]);
    for (const [kind, list] of byKind) {
      const names = list.slice(0, 4).map((s) => `"${s.name}"`).join(', ');
      const more = list.length > 4 ? ` and ${list.length - 4} more` : '';
      error(
        list[0]!.path,
        list.length === 1
          ? `${kind} ${names} cannot be reached from the packing area along the walkways.`
          : `${list.length} ${kind.toLowerCase()}s (${names}${more}) cannot be reached from the packing area along the walkways.`,
      );
    }
  }

  // --- Zones and pick shares --------------------------------------------
  const zonesWithLocations = new Set(layout.locations.map((l) => l.zoneId).filter((z) => zoneIds.has(z)));
  let shareTotal = 0;
  for (const z of layout.zones) {
    const share = z.pickShare.value;
    if (share === null) {
      if (zonesWithLocations.has(z.id)) error('layout.zones', `Zone "${z.name}" has no pick share. Enter how much of the picking happens there.`);
      continue;
    }
    if (share > 0 && !zonesWithLocations.has(z.id)) {
      error('layout.zones', `Zone "${z.name}" receives picks but contains no storage locations.`);
    }
    if (zonesWithLocations.has(z.id)) shareTotal += share;
  }
  if (layout.locations.length > 0 && zonesWithLocations.size > 0 && shareTotal <= 0) {
    error('layout.zones', 'All zone pick shares are zero, so no items can be picked.');
  }

  // --- Operations ---------------------------------------------------------
  const required = (path: string, label: string, p: Param<unknown>) => {
    if (p.value === null) error(path, `${label} is unknown. Enter a value or an assumption before simulating.`);
  };
  const s = ops.schedule;
  const w = ops.workload;
  const pk = ops.pickers;

  required('operations.schedule.shiftLengthHours', 'Shift length', s.shiftLengthHours);
  required('operations.schedule.maxOvertimeHours', 'Maximum overtime', s.maxOvertimeHours);
  required('operations.workload.ordersPerHour', 'Order arrival rate', w.ordersPerHour);
  required('operations.workload.itemsPerOrderMin', 'Minimum items per order', w.itemsPerOrderMin);
  required('operations.workload.itemsPerOrderMax', 'Maximum items per order', w.itemsPerOrderMax);
  required('operations.packing.secondsPerOrder', 'Packing time per order', ops.packing.secondsPerOrder);
  required('operations.packing.secondsPerItem', 'Packing time per item', ops.packing.secondsPerItem);
  for (const ps of layout.packingStations) required('layout.packingStations', `Packers at "${ps.name}"`, ps.capacity);

  if (w.itemsPerOrderMin.value !== null && w.itemsPerOrderMax.value !== null && w.itemsPerOrderMin.value > w.itemsPerOrderMax.value) {
    error('operations.workload.itemsPerOrderMax', 'Maximum items per order must be at least the minimum.');
  }
  if (w.ordersPerHour.value === 0) warn('operations.workload.ordersPerHour', 'The order rate is zero, so no orders will arrive.');

  if (w.arrivalPattern === 'hourly_profile') {
    const hours = Math.ceil((s.shiftLengthHours.value ?? 0) + (s.maxOvertimeHours.value ?? 0));
    if (w.hourlyProfile.length < hours) {
      error('operations.workload.hourlyProfile', `The hourly profile has ${w.hourlyProfile.length} entries but the shift plus overtime spans ${hours} hours.`);
    } else if (w.hourlyProfile.every((m) => m === 0)) {
      warn('operations.workload.hourlyProfile', 'Every hour in the profile is zero, so no orders will arrive.');
    }
  }

  const usesWorkers = pk.mode !== 'robots';
  const usesRobots = pk.mode !== 'workers';
  if (usesWorkers) {
    required('operations.pickers.workers.count', 'Number of pickers', pk.workers.count);
    required('operations.pickers.workers.speedMps', 'Picker walking speed', pk.workers.speedMps);
    required('operations.pickers.workers.pickSecondsPerItem', 'Picker time per item', pk.workers.pickSecondsPerItem);
    if ((pk.workers.speedMps.value ?? 0) > 2.5) warn('operations.pickers.workers.speedMps', 'Walking speed above 2.5 m/s is unusually fast for picking.');
  }
  if (usesRobots) {
    required('operations.pickers.robots.count', 'Number of robots', pk.robots.count);
    required('operations.pickers.robots.speedMps', 'Robot speed', pk.robots.speedMps);
    required('operations.pickers.robots.pickSecondsPerItem', 'Robot time per item', pk.robots.pickSecondsPerItem);
    if ((pk.robots.speedMps.value ?? 0) > 3) warn('operations.pickers.robots.speedMps', 'Robot speed above 3 m/s is unusual for indoor mobile robots near people.');
  }
  const pickerTotal = (usesWorkers ? pk.workers.count.value ?? 0 : 0) + (usesRobots ? pk.robots.count.value ?? 0 : 0);
  const countsKnown = (!usesWorkers || pk.workers.count.value !== null) && (!usesRobots || pk.robots.count.value !== null);
  if (countsKnown && pickerTotal === 0) error('operations.pickers', 'There are no pickers, so no orders can be fulfilled.');

  if (ops.strategy.picking === 'batch') required('operations.strategy.batchSize', 'Batch size', ops.strategy.batchSize);

  const c = ops.costs;
  const missingCosts = [
    usesWorkers && c.workerHourly.value === null ? 'picker labor' : null,
    c.packerHourly.value === null ? 'packer labor' : null,
    usesRobots && c.robotHourly.value === null ? 'robot operation' : null,
  ].filter(Boolean);
  if (missingCosts.length > 0) {
    warn('operations.costs', `No hourly cost for ${missingCosts.join(', ')}. Cost estimates will be incomplete.`);
  }

  return issues;
}
