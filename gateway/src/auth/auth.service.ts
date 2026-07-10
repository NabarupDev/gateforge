import { Injectable } from '@nestjs/common';
import { GatewayJwtService } from './jwt.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: GatewayJwtService) {}

  async generateToken(payload: JwtPayload): Promise<{ access_token: string; expires_in: string }> {
    const access_token = await this.jwtService.sign(payload);
    return {
      access_token,
      expires_in: '1h',
    };
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verify(token);
  }
}
