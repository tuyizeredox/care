import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
      // Prisma defaults to a 5s interactive transaction timeout, which assumes
      // the database is nearby. Against a managed/remote Postgres a handful of
      // sequential round trips can exceed it and fail an otherwise valid write,
      // so the budget is configurable and defaults to something more forgiving.
      transactionOptions: {
        timeout: Number(process.env.DB_TRANSACTION_TIMEOUT_MS) || 20_000,
        maxWait: Number(process.env.DB_TRANSACTION_MAX_WAIT_MS) || 10_000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Truncates every table. Guarded so it can only ever run outside production —
   * used by the integration test harness.
   */
  async resetDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('resetDatabase() is disabled in production');
    }
    const tables = await this.$queryRaw<Array<{ tablename: string }>>(
      Prisma.sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (tables.length === 0) return;
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  }
}
