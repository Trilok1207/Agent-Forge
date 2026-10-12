import type { DomainDefinition, ModelSummarySection } from '@/core/domain';
import { formatNumber, formatParam } from '@/core/format';
import { buildGraph, totalWalkwayLength } from './graph';
import {
  ARRIVAL_PATTERN_LABELS,
  PICKER_MODE_LABELS,
  PICKING_STRATEGY_LABELS,
  ROUTING_LABELS,
} from './labels';
import { createBlankModel, createSampleModel } from './sample';
import { WAREHOUSE_MODEL_VERSION, WarehouseModelSchema, type WarehouseModel } from './schema';
import { validateWarehouseModel } from './validate';

function summarize(m: WarehouseModel): ModelSummarySection[] {
  const { layout, operations: o } = m;
  const cur = o.costs.currency;
  const packers = layout.packingStations.reduce((sum, p) => sum + (p.capacity.value ?? 0), 0);
  const walkway = totalWalkwayLength(buildGraph(layout));

  return [
    {
      title: 'Building and layout',
      items: [
        { label: 'Building size', value: `${formatNumber(layout.width)} m × ${formatNumber(layout.depth)} m`, source: layout.source },
        { label: 'Storage zones', value: String(layout.zones.length) },
        { label: 'Storage locations', value: String(layout.locations.length) },
        { label: 'Packing stations', value: `${layout.packingStations.length} (${packers} packers)` },
        { label: 'Docks', value: String(layout.docks.length) },
        { label: 'Walkway length', value: `${formatNumber(walkway, 1)} m`, help: 'Total length of the travel network pickers can use.' },
      ],
    },
    {
      title: 'Schedule and workload',
      items: [
        { label: 'Shift length', value: formatParam(o.schedule.shiftLengthHours, 'h'), source: o.schedule.shiftLengthHours.source },
        { label: 'Maximum overtime', value: formatParam(o.schedule.maxOvertimeHours, 'h'), source: o.schedule.maxOvertimeHours.source, help: 'Extra time allowed after the shift to finish orders already received.' },
        { label: 'Arrival pattern', value: ARRIVAL_PATTERN_LABELS[o.workload.arrivalPattern] },
        { label: 'Orders arriving', value: formatParam(o.workload.ordersPerHour, 'orders/h'), source: o.workload.ordersPerHour.source },
        { label: 'Items per order (min)', value: formatParam(o.workload.itemsPerOrderMin), source: o.workload.itemsPerOrderMin.source },
        { label: 'Items per order (max)', value: formatParam(o.workload.itemsPerOrderMax), source: o.workload.itemsPerOrderMax.source },
      ],
    },
    {
      title: 'Pickers',
      items: [
        { label: 'Who picks', value: PICKER_MODE_LABELS[o.pickers.mode] },
        ...(o.pickers.mode !== 'robots'
          ? [
              { label: 'People picking', value: formatParam(o.pickers.workers.count), source: o.pickers.workers.count.source },
              { label: 'Walking speed', value: formatParam(o.pickers.workers.speedMps, 'm/s'), source: o.pickers.workers.speedMps.source },
              { label: 'Time per item (person)', value: formatParam(o.pickers.workers.pickSecondsPerItem, 's'), source: o.pickers.workers.pickSecondsPerItem.source },
            ]
          : []),
        ...(o.pickers.mode !== 'workers'
          ? [
              { label: 'Robots', value: formatParam(o.pickers.robots.count), source: o.pickers.robots.count.source },
              { label: 'Robot speed', value: formatParam(o.pickers.robots.speedMps, 'm/s'), source: o.pickers.robots.speedMps.source },
              { label: 'Time per item (robot)', value: formatParam(o.pickers.robots.pickSecondsPerItem, 's'), source: o.pickers.robots.pickSecondsPerItem.source },
            ]
          : []),
      ],
    },
    {
      title: 'Picking and packing method',
      items: [
        { label: 'Picking strategy', value: PICKING_STRATEGY_LABELS[o.strategy.picking] },
        ...(o.strategy.picking === 'batch'
          ? [{ label: 'Orders per batch', value: formatParam(o.strategy.batchSize), source: o.strategy.batchSize.source }]
          : []),
        { label: 'Route within a trip', value: ROUTING_LABELS[o.strategy.routing] },
        { label: 'Packing time per order', value: formatParam(o.packing.secondsPerOrder, 's'), source: o.packing.secondsPerOrder.source },
        { label: 'Packing time per item', value: formatParam(o.packing.secondsPerItem, 's'), source: o.packing.secondsPerItem.source },
      ],
    },
    {
      title: 'Costs',
      items: [
        { label: 'Picker labor', value: formatParam(o.costs.workerHourly, `${cur}/h`), source: o.costs.workerHourly.source },
        { label: 'Packer labor', value: formatParam(o.costs.packerHourly, `${cur}/h`), source: o.costs.packerHourly.source },
        { label: 'Robot operation', value: formatParam(o.costs.robotHourly, `${cur}/h`), source: o.costs.robotHourly.source, help: 'Energy, maintenance and lease per robot-hour.' },
        { label: 'Overtime multiplier', value: formatParam(o.costs.overtimeMultiplier, '×'), source: o.costs.overtimeMultiplier.source },
      ],
    },
  ];
}

export const warehouseDomain: DomainDefinition<WarehouseModel> = {
  id: 'warehouse',
  label: 'Warehouse operations',
  description: 'Order picking and packing in a single-floor warehouse with people and/or mobile robots.',
  modelVersion: WAREHOUSE_MODEL_VERSION,
  modelSchema: WarehouseModelSchema,
  createBlankModel,
  createSample: () => ({
    name: 'Sample warehouse',
    description:
      'A small illustrative warehouse with three storage zones, five aisles and two packing stations. All values are examples — not data from a real site.',
    model: createSampleModel(),
  }),
  validateModel: validateWarehouseModel,
  summarize,
};
