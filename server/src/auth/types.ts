export interface AuthPrincipal {
  subject: string;
  tenant: string;
  clientId: string | null;
  scopes: ReadonlySet<string>;
  expiresAt: number;
}

export interface TokenVerifier {
  verify(token: string, requiredScope: string): Promise<AuthPrincipal>;
}
