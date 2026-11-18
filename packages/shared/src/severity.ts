/** Severity levels of a finding, ordered from the least to the most severe. */
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export type Severity = (typeof SEVERITIES)[number];
