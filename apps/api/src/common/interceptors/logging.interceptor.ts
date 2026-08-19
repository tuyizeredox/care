import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const { method, originalUrl } = request;
    const startedAt = Date.now();
    const actor = request.user?.email ?? 'anonymous';

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(`${method} ${originalUrl} ${Date.now() - startedAt}ms (${actor})`),
        error: (error: Error) =>
          this.logger.warn(
            `${method} ${originalUrl} FAILED ${Date.now() - startedAt}ms (${actor}): ${error.message}`,
          ),
      }),
    );
  }
}
