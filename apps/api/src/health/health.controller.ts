import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '@/auth/decorators/public.decorator';

/**
 * `GET /health` — public endpoint returning the application health status.
 *
 * Checks:
 *   - TypeORM database connection via `TypeOrmHealthIndicator`.
 *
 * Decorated with `@Public()` so the global `JwtAuthGuard` does not block it.
 * Returns 200 with `{ status: 'ok', ... }` on success, or 503 with
 * `{ status: 'error', ... }` when any indicator is down.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check — public' })
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
