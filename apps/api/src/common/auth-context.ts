import type { MembershipRole } from '@prisma/client';

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  sessionId: string;
  tenantId: string | null;
  role: MembershipRole | null;
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    isTenantActive: boolean;
    role: MembershipRole;
  }>;
}
