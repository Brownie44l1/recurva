export interface PortalSession {
  token: string;
  expiresAt: Date;
  portalUrl: string;
}

export interface PortalClaims {
  tenantId: string;
  customerId: string;
  email: string;
  exp: number;
}
