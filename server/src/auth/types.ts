export interface AuthPrincipal {
  subject: string;
  tenant: string;
  clientId: string | null;
  scopes: ReadonlySet<string>;
  expiresAt: number;
  allowedRoles: ReadonlySet<string>;
  allowedWorkspaces: ReadonlySet<string>;
}

export interface TokenVerifier {
  verify(token: string, requiredScope: string): Promise<AuthPrincipal>;
}
