import type { SuccessMetric } from './schema';

export const PICKER_MODE_LABELS = {
  workers: 'People only',
  robots: 'Robots only',
  mixed: 'People and robots',
} as const;

export const PICKING_STRATEGY_LABELS = {
  single_order: 'One order per trip',
  batch: 'Batch several orders per trip',
} as const;

export const ROUTING_LABELS = {
  nearest_neighbor: 'Go to the nearest remaining pick',
  zone_sequence: 'Visit zones in a fixed order',
} as const;

export const ARRIVAL_PATTERN_LABELS = {
  constant: 'Steady rate all shift',
  hourly_profile: 'Rate varies by hour',
} as const;

export const SUCCESS_METRIC_LABELS: Record<SuccessMetric, { label: string; unit: string }> = {
  throughput_per_hour: { label: 'Orders completed per hour', unit: 'orders/h' },
  orders_completed: { label: 'Orders completed in the run', unit: 'orders' },
  avg_completion_min: { label: 'Average order completion time', unit: 'min' },
  p90_completion_min: { label: '90th-percentile completion time', unit: 'min' },
  cost_per_order: { label: 'Cost per completed order', unit: 'currency/order' },
  picker_utilization: { label: 'Picker utilization', unit: '%' },
};
