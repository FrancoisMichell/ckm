/**
 * Standard paginated response envelope.
 * Mirrors the shape returned by all list endpoints.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
