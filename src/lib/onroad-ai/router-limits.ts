/** Per-message limits that do not depend on the plan. Plan quotas are in ./plans.ts. */

export interface Limits {
  burstPerMinute: number;
  messagesPerDay: number;
  aiCallsPerDay: number;
  transcriptionsPerDay: number;
  maxMediaBytes: number;
  /** Estimated cost per delivered reply, for reporting. */
  whatsappCostPerMessageUsd: number;
}

export const DEFAULT_LIMITS: Limits = {
  burstPerMinute: 8,
  messagesPerDay: 200,
  aiCallsPerDay: 60,
  transcriptionsPerDay: 30,
  maxMediaBytes: 4 * 1024 * 1024,
  whatsappCostPerMessageUsd: 0.0034,
};

