import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    let url = process.env.DATABASE_URL || 'file:../prisma/dev.db';
    if (url.startsWith('postgres:') || url.startsWith('postgresql:')) {
      const pool = new Pool({ connectionString: url });
      const adapter = new PrismaPg(pool as any);
      super({ adapter });
    } else {
      if (!url.startsWith('file:') && !url.startsWith('libsql:') && !url.startsWith('http:') && !url.startsWith('https:')) {
        url = 'file:../prisma/dev.db';
      }
      const adapter = new PrismaLibSql({ url } as any);
      super({ adapter });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
