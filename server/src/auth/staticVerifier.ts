import { AppError } from "../errors.js";
import type { AuthPrincipal, TokenVerifier } from "./types.js";

export class StaticPrincipalVerifier implements TokenVerifier {
  readonly #principal: AuthPrincipal;

  constructor(principal: AuthPrincipal) {
    this.#principal = principal;
  }

  verify(_token: string, requiredScope: string): Promise<AuthPrincipal> {
    if (!this.#principal.scopes.has(requiredScope)) {
      return Promise.reject(
        new AppError("SCOPE_REQUIRED", "The local QCoder connection lacks permission.", 403),
      );
    }
    return Promise.resolve(this.#principal);
  }
}
