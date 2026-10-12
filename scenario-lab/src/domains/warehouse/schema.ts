import { z } from 'zod';
import { paramSchema, ValueSourceSchema } from '@/core/provenance';

/**
 * Warehouse model, version 1.
 *
 * Units (fixed for this model version, shown throughout the UI):
 *   length: metres (m)      speed: metres per second (m/s)
 *   time:   seconds (s) for task durations, hours (h) for shifts
 *   rates:  orders per hour  money: project currency per hour / per order
 *
 * Coordinates: origin at the top-left corner of the building, x to the
 * right, y downwards (matches the 2D layout view).
 */
export const WAREHOUSE_MODEL_VERSION = 'warehouse-1.0.0';

const id = z.string().min(1).max(64);
const label = z.string().trim().min(1, 'A name is required.').max(80);
const coord = z.number().finite();
const size = z.number().finite().positive('Size must be greater than zero.');

const positiveNumber = z.number().finite().positive('Must be greater than zero.');
const nonNegativeNumber = z.number().finite().min(0, 'Must not be negative.');
const nonNegativeInt = z.number().int('Must be a whole number.').min(0, 'Must not be negative.');
const positiveInt = z.number().int('Must be a whole number.').min(1, 'Must be at least 1.');

const rect = { x: coord, y: coord, width: size, depth: size };

/** A point on the walkway network that people and robots travel along. */
export const PathNodeSchema = z.object({ id, x: coord, y: coord });

/** A straight, two-way walkway segment between two nodes. */
export const PathEdgeSchema = z.object({ id, from: id, to: id });

/** An area of the building that groups storage locations (e.g. fast movers). */
export const StorageZoneSchema = z.object({
  id,
  name: label,
  ...rect,
  /** Relative share of picked items that come from this zone. */
  pickShare: paramSchema(nonNegativeNumber),
});

/** A rack/bay that holds items. Pickers stop at its access node. */
export const StorageLocationSchema = z.object({
  id,
  label,
  zoneId: id,
  ...rect,
  accessNodeId: id,
});

/** Where completed picks are packed. `capacity` = packers working in parallel. */
export const PackingStationSchema = z.object({
  id,
  name: label,
  ...rect,
  accessNodeId: id,
  capacity: paramSchema(positiveInt),
});

export const DockSchema = z.object({
  id,
  name: label,
  kind: z.enum(['inbound', 'outbound']),
  ...rect,
  accessNodeId: id,
});

export const LayoutSchema = z.object({
  width: size,
  depth: size,
  source: ValueSourceSchema,
  nodes: z.array(PathNodeSchema),
  edges: z.array(PathEdgeSchema),
  zones: z.array(StorageZoneSchema),
  locations: z.array(StorageLocationSchema),
  packingStations: z.array(PackingStationSchema),
  docks: z.array(DockSchema),
});

export const PICKER_MODES = ['workers', 'robots', 'mixed'] as const;
export const PICKING_STRATEGIES = ['single_order', 'batch'] as const;
export const ROUTING_POLICIES = ['nearest_neighbor', 'zone_sequence'] as const;
export const ARRIVAL_PATTERNS = ['constant', 'hourly_profile'] as const;

export const OperationsSchema = z.object({
  schedule: z.object({
    shiftLengthHours: paramSchema(z.number().finite().positive().max(24, 'A shift cannot exceed 24 hours.')),
    /** Extra time allowed to finish open orders after the shift (0 = none). */
    maxOvertimeHours: paramSchema(z.number().finite().min(0).max(12)),
  }),
  workload: z.object({
    arrivalPattern: z.enum(ARRIVAL_PATTERNS),
    ordersPerHour: paramSchema(nonNegativeNumber),
    /** Multipliers on `ordersPerHour` for each shift hour (hourly_profile only). */
    hourlyProfile: z.array(nonNegativeNumber).max(24),
    itemsPerOrderMin: paramSchema(positiveInt),
    itemsPerOrderMax: paramSchema(positiveInt),
  }),
  pickers: z.object({
    mode: z.enum(PICKER_MODES),
    workers: z.object({
      count: paramSchema(nonNegativeInt),
      speedMps: paramSchema(positiveNumber),
      pickSecondsPerItem: paramSchema(positiveNumber),
    }),
    robots: z.object({
      count: paramSchema(nonNegativeInt),
      speedMps: paramSchema(positiveNumber),
      pickSecondsPerItem: paramSchema(positiveNumber),
    }),
  }),
  strategy: z.object({
    picking: z.enum(PICKING_STRATEGIES),
    batchSize: paramSchema(positiveInt),
    routing: z.enum(ROUTING_POLICIES),
  }),
  packing: z.object({
    secondsPerOrder: paramSchema(nonNegativeNumber),
    secondsPerItem: paramSchema(nonNegativeNumber),
  }),
  costs: z.object({
    currency: z.string().trim().min(1).max(8),
    workerHourly: paramSchema(nonNegativeNumber),
    packerHourly: paramSchema(nonNegativeNumber),
    robotHourly: paramSchema(nonNegativeNumber),
    overtimeMultiplier: paramSchema(z.number().finite().min(1, 'Overtime cannot cost less than regular time.')),
  }),
});

export const SUCCESS_METRICS = [
  'throughput_per_hour',
  'orders_completed',
  'avg_completion_min',
  'p90_completion_min',
  'cost_per_order',
  'picker_utilization',
] as const;

export const GoalsSchema = z.object({
  successCriteria: z.array(
    z.object({
      id,
      metric: z.enum(SUCCESS_METRICS),
      comparator: z.enum(['at_least', 'at_most']),
      target: z.number().finite(),
    }),
  ),
  constraints: z.array(z.object({ id, text: z.string().trim().min(1).max(500) })),
});

/** A free-text assumption the user wants recorded alongside results. */
export const AssumptionSchema = z.object({
  id,
  statement: z.string().trim().min(1).max(500),
  source: ValueSourceSchema,
  reference: z.string().max(300).optional(),
});

export const WarehouseModelSchema = z.object({
  modelVersion: z.literal(WAREHOUSE_MODEL_VERSION),
  layout: LayoutSchema,
  operations: OperationsSchema,
  goals: GoalsSchema,
  assumptions: z.array(AssumptionSchema),
});

export type WarehouseModel = z.infer<typeof WarehouseModelSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type PathNode = z.infer<typeof PathNodeSchema>;
export type PathEdge = z.infer<typeof PathEdgeSchema>;
export type StorageZone = z.infer<typeof StorageZoneSchema>;
export type StorageLocation = z.infer<typeof StorageLocationSchema>;
export type PackingStation = z.infer<typeof PackingStationSchema>;
export type Dock = z.infer<typeof DockSchema>;
export type Operations = z.infer<typeof OperationsSchema>;
export type SuccessMetric = (typeof SUCCESS_METRICS)[number];
