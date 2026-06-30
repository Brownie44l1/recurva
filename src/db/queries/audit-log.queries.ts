import type { Sql } from 'postgres';

export interface AuditLogEntry {
  id: number;
  tenantId: string | null;
  resourceType: string;
  resourceId: string;
  actorType: string;
  actorId: string | null;
  action: string;
  diff: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export async function insertAuditLog(sql: Sql, input: {
  tenantId: string;
  resourceType: string;
  resourceId: string;
  actorType: string;
  actorId?: string;
  action: string;
  diff?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuditLogEntry> {
  const [row] = await sql<AuditLogEntry[]>`
    INSERT INTO audit_logs (tenant_id, resource_type, resource_id, actor_type, actor_id, action, diff, ip_address, user_agent)
    VALUES (${input.tenantId}, ${input.resourceType}, ${input.resourceId}, ${input.actorType}, ${input.actorId ?? null}, ${input.action}, ${sql.json(input.diff ?? null as any)}, ${input.ipAddress ?? null}, ${input.userAgent ?? null})
    RETURNING *
  `;
  return row!;
}

export async function findAuditLogsByResource(sql: Sql, resourceType: string, resourceId: string, limit: number = 50): Promise<AuditLogEntry[]> {
  return sql<AuditLogEntry[]>`
    SELECT * FROM audit_logs
    WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
