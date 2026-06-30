export interface DunningPolicy {
  id: string;
  tenantId: string;
  name: string;
  retrySchedule: RetryScheduleEntry[];
  finalAction: 'cancel' | 'mark_unpaid';
  isDefault: boolean;
  createdAt: Date;
}

export interface RetryScheduleEntry {
  day: number;
  useBackup?: boolean;
}

export interface DunningAttempt {
  id: string;
  subscriptionId: string;
  invoiceId: string;
  chargeId: string | null;
  attemptNumber: number;
  scheduledAt: Date;
  executedAt: Date | null;
  status: string;
  usedBackupCard: boolean;
  createdAt: Date;
}

export interface DunningAttemptResult {
  success: boolean;
  chargeId?: string;
  failureReason?: string;
  usedBackupCard: boolean;
}

export type DunningPolicyDecision = 'continue' | 'cancel' | 'mark_unpaid';
