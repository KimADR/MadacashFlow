import type { Request } from 'express';
import type { AuthenticatedUserContext } from './auth-context';

export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedUserContext;
}
