export interface UsageRecord {
  id: string;
  subscriptionId: string;
  idempotencyKey: string;
  quantity: number;
  action: string;
  periodStart: Date;
  periodEnd: Date;
  recordedAt: Date;
}

export interface ReportUsageInput {
  subscriptionId: string;
  idempotencyKey: string;
  quantity: number;
  timestamp: Date;
}

export interface UsageAggregation {
  totalUnits: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface UsageSummary {
  currentPeriod: {
    start: Date;
    end: Date;
    quantity: number;
  };
  previousPeriod: {
    start: Date;
    end: Date;
    quantity: number;
  } | null;
}
