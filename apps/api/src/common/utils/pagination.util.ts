import { Paginated, PaginationMeta } from '../dto/pagination.dto';

export const skipTake = (page: number, pageSize: number): { skip: number; take: number } => ({
  skip: (Math.max(page, 1) - 1) * pageSize,
  take: pageSize,
});

export const buildMeta = (page: number, pageSize: number, total: number): PaginationMeta => {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};

export const paginate = <T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
): Paginated<T> => ({ data, meta: buildMeta(page, pageSize, total) });
