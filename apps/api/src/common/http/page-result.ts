/** Returned by list endpoints; the envelope interceptor moves paging info into `meta`. */
export class PageResult<T> {
  constructor(
    readonly items: T[],
    readonly page: number,
    readonly pageSize: number,
    readonly total: number,
  ) {}
}
