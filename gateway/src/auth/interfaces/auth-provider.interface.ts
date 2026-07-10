import { RequestUser } from '../types/request-user.type';

export interface AuthProvider {
  /**
   * Verifies an access token (such as a JWT) and extracts the authenticated user claims.
   * Throws an error if the token is malformed, expired, or has an invalid signature.
   */
  verifyToken(token: string): Promise<RequestUser>;
}
