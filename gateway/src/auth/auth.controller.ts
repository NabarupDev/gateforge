import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

export class TokenRequestDto {
  id?: string;
  email?: string;
  role?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('token')
  async getToken(@Body() body: TokenRequestDto) {
    if (!body || (!body.id && !body.email)) {
      throw new BadRequestException('Provide at least id or email in request body');
    }

    const payload = {
      sub: body.id || '1',
      id: body.id || '1',
      email: body.email || 'test@gateforge.com',
      role: body.role || 'user',
    };

    return this.authService.generateToken(payload);
  }
}
