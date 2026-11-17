/** Names of the BullMQ queues. Job payloads carry only identifiers, never file contents or secrets. */
export const QueueName = {
  ScanInitial: 'scan-initial',
  ScanIncremental: 'scan-incremental',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
