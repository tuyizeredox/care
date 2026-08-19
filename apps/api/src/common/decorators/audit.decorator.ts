import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'auditAction';

export interface AuditMetadata {
  action: string;
  resourceType: string;
}

/** Records a system audit-log entry when the handler succeeds. */
export const Audit = (action: string, resourceType: string) =>
  SetMetadata(AUDIT_KEY, { action, resourceType } satisfies AuditMetadata);
