import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    let url = process.env.DATABASE_URL || 'file:../prisma/dev.db';
    if (!url.startsWith('file:') && !url.startsWith('libsql:') && !url.startsWith('http:') && !url.startsWith('https:')) {
      url = 'file:../prisma/dev.db';
    }
    const libsql = createClient({ url });
    const adapter = new PrismaLibSql(libsql as any);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
