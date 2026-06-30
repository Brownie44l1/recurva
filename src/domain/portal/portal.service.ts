import type { PortalSession, PortalClaims } from './portal.types';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

export async function issuePortalSession(tenantId: string, customerId: string, email: string): Promise<PortalSession> {
  const expiresAt = new Date(Date.now() + 3600000);

  const token = jwt.sign(
    { tenantId, customerId, email, exp: Math.floor(expiresAt.getTime() / 1000) },
    config.JWT_SECRET,
    { algorithm: 'HS256' },
  );

  return {
    token,
    expiresAt,
    portalUrl: `/portal/session?token=${token}`,
  };
}

export async function verifyPortalToken(token: string): Promise<PortalClaims> {
  const decoded = jwt.verify(token, config.JWT_SECRET) as PortalClaims;
  return decoded;
}
