import { getApiData } from './server-api';

export type CurrentUser = {
  user: { id: string; email: string };
  tenantId: string | null;
  role: string | null;
  tenant: { id: string; name: string } | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getApiData<CurrentUser>('/auth/me');
}
