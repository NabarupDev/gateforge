import { Controller, Post, Get, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { Public } from '../auth/decorators/public.decorator';

export class CreateConsumerDto {
  name!: string;
  description?: string;
}

export class CreateApiKeyDto {
  consumerName?: string;
  consumerIdOrName?: string;
  name!: string;
  prefixType?: string;
  expiresAt?: string;
}

@Controller('gateway')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Public()
  @Post('consumers')
  async createConsumer(@Body() dto: CreateConsumerDto) {
    return this.apiKeyService.createConsumer(dto.name, dto.description);
  }

  @Public()
  @Get('consumers')
  async listConsumers() {
    return this.apiKeyService.listConsumers();
  }

  @Public()
  @Post('api-keys')
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    const consumerIdentifier = dto.consumerName || dto.consumerIdOrName || 'Default Consumer';
    const response = await this.apiKeyService.generateApiKey(
      consumerIdentifier,
      dto.name || 'Default Key',
      dto.prefixType || 'gf_live',
      dto.expiresAt,
    );

    return {
      id: response.id,
      key: response.key,
      prefix: response.prefix,
      consumerId: response.consumerId,
    };
  }

  @Public()
  @Delete('api-keys/:id/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeApiKey(@Param('id') id: string) {
    return this.apiKeyService.revokeApiKey(id);
  }
}
