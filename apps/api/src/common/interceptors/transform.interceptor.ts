import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

const isPaginated = (value: unknown): value is { data: unknown; meta: Record<string, unknown> } =>
  typeof value === 'object' &&
  value !== null &&
  'data' in value &&
  'meta' in value &&
  Object.keys(value).length === 2;

/**
 * Wraps every successful response in a consistent envelope:
 *   { success: true, data, meta? }
 * Paginated services already return { data, meta } and are passed through.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    return next.handle().pipe(
      map((payload) => {
        if (isPaginated(payload)) {
          return { success: true, data: payload.data as T, meta: payload.meta };
        }
        return { success: true, data: payload };
      }),
    );
  }
}
