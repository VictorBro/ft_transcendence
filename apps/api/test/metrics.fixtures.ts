import type { Metric } from '@prometheus-io/client';

/**
 * The value of the series with exactly these labels, or undefined when it does
 * not exist, which is not the same as 0 for a pre-initialised one. `suffix`
 * picks a histogram's `_count` or `_sum`.
 */
export async function seriesValue(
  metric: Metric<string>,
  labels: Record<string, string | number> = {},
  suffix = '',
): Promise<number | undefined> {
  const { name, values } = await metric.get();
  const wanted = Object.entries(labels);
  return values.find(
    (sample) =>
      (('metricName' in sample && sample.metricName) || name) === `${name}${suffix}` &&
      Object.keys(sample.labels).length === wanted.length &&
      wanted.every(([label, value]) => sample.labels[label] === value),
  )?.value;
}
