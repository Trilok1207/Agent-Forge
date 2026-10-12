import { param, unknownParam } from '@/core/provenance';
import {
  WAREHOUSE_MODEL_VERSION,
  type Layout,
  type PathEdge,
  type PathNode,
  type StorageLocation,
  type StorageZone,
  type WarehouseModel,
} from './schema';

const SAMPLE_NOTE = 'Sample value for illustration — not taken from a real site.';

/**
 * Build the small sample warehouse (56 m × 40 m): five picking aisles with
 * racks on both sides, top and bottom cross-aisles, two packing stations on
 * the right, and inbound/outbound docks along the bottom wall.
 */
export function buildSampleLayout(): Layout {
  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];
  const addNode = (id: string, x: number, y: number) => nodes.push({ id, x, y });
  const link = (from: string, to: string) => edges.push({ id: `e_${from}_${to}`, from, to });

  const aisleXs = [6, 14, 22, 30, 38];
  const stopYs = [9, 16, 23]; // mid-points of rack segments
  const topY = 4;
  const bottomY = 30;

  aisleXs.forEach((x, a) => {
    const ids = [`n_a${a + 1}_top`, ...stopYs.map((_, s) => `n_a${a + 1}_s${s + 1}`), `n_a${a + 1}_bot`];
    [topY, ...stopYs, bottomY].forEach((y, i) => addNode(ids[i]!, x, y));
    for (let i = 0; i < ids.length - 1; i++) link(ids[i]!, ids[i + 1]!);
    if (a > 0) {
      link(`n_a${a}_top`, ids[0]!);
      link(`n_a${a}_bot`, ids[ids.length - 1]!);
    }
  });

  // Packing corridor on the right.
  addNode('n_pack_top', 46, topY);
  addNode('n_pack_1', 46, 10);
  addNode('n_pack_2', 46, 18);
  addNode('n_pack_bot', 46, bottomY);
  link('n_a5_top', 'n_pack_top');
  link('n_a5_bot', 'n_pack_bot');
  link('n_pack_top', 'n_pack_1');
  link('n_pack_1', 'n_pack_2');
  link('n_pack_2', 'n_pack_bot');

  // Dock approaches.
  addNode('n_dock_in', 6, 34);
  addNode('n_dock_out', 46, 34);
  link('n_a1_bot', 'n_dock_in');
  link('n_pack_bot', 'n_dock_out');

  const zones: StorageZone[] = [
    { id: 'z_a', name: 'Zone A – fast movers', x: 2, y: 5, width: 16, depth: 22, pickShare: param(0.6, 'user_assumption', SAMPLE_NOTE) },
    { id: 'z_b', name: 'Zone B – medium movers', x: 18, y: 5, width: 16, depth: 22, pickShare: param(0.3, 'user_assumption', SAMPLE_NOTE) },
    { id: 'z_c', name: 'Zone C – slow movers', x: 34, y: 5, width: 7, depth: 22, pickShare: param(0.1, 'user_assumption', SAMPLE_NOTE) },
  ];
  const zoneForAisle = (a: number) => (a < 2 ? 'z_a' : a < 4 ? 'z_b' : 'z_c');

  const locations: StorageLocation[] = [];
  aisleXs.forEach((x, a) => {
    stopYs.forEach((y, s) => {
      for (const side of ['L', 'R'] as const) {
        locations.push({
          id: `loc_a${a + 1}_${s + 1}${side}`,
          label: `A${a + 1}-${s + 1}${side}`,
          zoneId: zoneForAisle(a),
          x: side === 'L' ? x - 3 : x + 1,
          y: y - 3,
          width: 2,
          depth: 6,
          accessNodeId: `n_a${a + 1}_s${s + 1}`,
        });
      }
    });
  });

  return {
    width: 56,
    depth: 40,
    source: 'user_assumption',
    nodes,
    edges,
    zones,
    locations,
    packingStations: [
      { id: 'ps_1', name: 'Pack station 1', x: 48, y: 8, width: 5, depth: 4, accessNodeId: 'n_pack_1', capacity: param(1, 'user_assumption', SAMPLE_NOTE) },
      { id: 'ps_2', name: 'Pack station 2', x: 48, y: 16, width: 5, depth: 4, accessNodeId: 'n_pack_2', capacity: param(1, 'user_assumption', SAMPLE_NOTE) },
    ],
    docks: [
      { id: 'dock_in', name: 'Receiving dock', kind: 'inbound', x: 2, y: 36, width: 10, depth: 4, accessNodeId: 'n_dock_in' },
      { id: 'dock_out', name: 'Shipping dock', kind: 'outbound', x: 41, y: 36, width: 10, depth: 4, accessNodeId: 'n_dock_out' },
    ],
  };
}

export function createSampleModel(): WarehouseModel {
  return {
    modelVersion: WAREHOUSE_MODEL_VERSION,
    layout: buildSampleLayout(),
    operations: {
      schedule: {
        shiftLengthHours: param(8, 'user_assumption', SAMPLE_NOTE),
        maxOvertimeHours: param(1, 'user_assumption', SAMPLE_NOTE),
      },
      workload: {
        arrivalPattern: 'constant',
        ordersPerHour: param(60, 'user_assumption', SAMPLE_NOTE),
        hourlyProfile: [],
        itemsPerOrderMin: param(1, 'user_assumption', SAMPLE_NOTE),
        itemsPerOrderMax: param(5, 'user_assumption', SAMPLE_NOTE),
      },
      pickers: {
        mode: 'workers',
        workers: {
          count: param(4, 'user_assumption', SAMPLE_NOTE),
          speedMps: param(1.2, 'default', 'Typical walking pace with a cart; varies by site.'),
          pickSecondsPerItem: param(12, 'default', 'Generic per-item pick time; measure on your site if possible.'),
        },
        robots: {
          count: param(0, 'user_assumption', SAMPLE_NOTE),
          speedMps: param(1.0, 'default', 'Generic indoor mobile robot speed; check vendor specification.'),
          pickSecondsPerItem: param(20, 'default', 'Generic robotic pick time; highly item-dependent.'),
        },
      },
      strategy: {
        picking: 'single_order',
        batchSize: param(3, 'default'),
        routing: 'nearest_neighbor',
      },
      packing: {
        secondsPerOrder: param(45, 'user_assumption', SAMPLE_NOTE),
        secondsPerItem: param(8, 'user_assumption', SAMPLE_NOTE),
      },
      costs: {
        currency: 'USD',
        workerHourly: param(25, 'user_assumption', SAMPLE_NOTE),
        packerHourly: param(25, 'user_assumption', SAMPLE_NOTE),
        robotHourly: param(12, 'user_assumption', 'Sample value covering energy and equipment lease — illustrative only.'),
        overtimeMultiplier: param(1.5, 'default'),
      },
    },
    goals: {
      successCriteria: [
        { id: 'sc_1', metric: 'throughput_per_hour', comparator: 'at_least', target: 55 },
        { id: 'sc_2', metric: 'p90_completion_min', comparator: 'at_most', target: 30 },
      ],
      constraints: [{ id: 'c_1', text: 'No more than 6 pickers on the floor at once.' }],
    },
    assumptions: [
      { id: 'as_1', statement: 'All items fit in one picker tote; no split orders.', source: 'user_assumption' },
      { id: 'as_2', statement: 'Stock is always available at its location (no replenishment delays).', source: 'default' },
    ],
  };
}

/**
 * A blank model: an empty building with generic defaults. Values the app
 * cannot reasonably guess (demand, staffing, costs) start as unknown.
 */
export function createBlankModel(): WarehouseModel {
  const sample = createSampleModel();
  return {
    modelVersion: WAREHOUSE_MODEL_VERSION,
    layout: {
      width: 50,
      depth: 30,
      source: 'default',
      nodes: [],
      edges: [],
      zones: [],
      locations: [],
      packingStations: [],
      docks: [],
    },
    operations: {
      schedule: {
        shiftLengthHours: param(8, 'default'),
        maxOvertimeHours: param(0, 'default'),
      },
      workload: {
        arrivalPattern: 'constant',
        ordersPerHour: unknownParam('How many orders arrive per hour on a typical day?'),
        hourlyProfile: [],
        itemsPerOrderMin: param(1, 'default'),
        itemsPerOrderMax: unknownParam('What is the largest typical order, in items?'),
      },
      pickers: {
        mode: 'workers',
        workers: {
          count: unknownParam('How many people pick orders during the shift?'),
          speedMps: sample.operations.pickers.workers.speedMps,
          pickSecondsPerItem: sample.operations.pickers.workers.pickSecondsPerItem,
        },
        robots: {
          count: param(0, 'default'),
          speedMps: sample.operations.pickers.robots.speedMps,
          pickSecondsPerItem: sample.operations.pickers.robots.pickSecondsPerItem,
        },
      },
      strategy: { picking: 'single_order', batchSize: param(3, 'default'), routing: 'nearest_neighbor' },
      packing: {
        secondsPerOrder: unknownParam('How long does packing an order take, excluding per-item time?'),
        secondsPerItem: param(8, 'default'),
      },
      costs: {
        currency: 'USD',
        workerHourly: unknownParam(),
        packerHourly: unknownParam(),
        robotHourly: unknownParam(),
        overtimeMultiplier: param(1.5, 'default'),
      },
    },
    goals: { successCriteria: [], constraints: [] },
    assumptions: [],
  };
}
