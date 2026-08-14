import type { TQuery } from "../module/user/user.interface.js";



export class QueryBuilder<TWhere extends object = Record<string, unknown>> {
  private where: TWhere = {} as TWhere;

  private page = 1;
  private limit = 10;

  private orderBy: Record<string, 'asc' | 'desc'> = {
    createdAt: 'desc',
  };

  private searchFields: string[] = [];

  constructor(
    private readonly query: TQuery
  ) {}

  search(fields: string[]) {
    this.searchFields = fields;

    const searchTerm = this.query.search;

    if (searchTerm && fields.length > 0) {
      const searchConditions = fields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      }));

      Object.assign(this.where, {
        OR: searchConditions,
      });
    }

    return this;
  }

  filter(fields: string[]) {
    const excludedFields = [
      'search',
      'page',
      'limit',
      'sortBy',
      'sortOrder',
    ];

    const filterData: Record<string, unknown> = {};

    for (const field of fields) {
      if (
        !excludedFields.includes(field) &&
        this.query[field] !== undefined
      ) {
        filterData[field] = this.query[field];
      }
    }

    Object.assign(this.where, filterData);

    return this;
  }

  sort(defaultSortBy = 'createdAt') {
    const sortBy =
      typeof this.query.sortBy === 'string'
        ? this.query.sortBy
        : defaultSortBy;

    const sortOrder =
      this.query.sortOrder === 'asc' ? 'asc' : 'desc';

    this.orderBy = {
      [sortBy]: sortOrder,
    };

    return this;
  }

  paginate() {
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;

    this.page = Math.max(page, 1);
    this.limit = Math.min(Math.max(limit, 1), 100);

    return this;
  }

  getWhere() {
    return this.where;
  }

  getOrderBy() {
    return this.orderBy;
  }

  getSkip() {
    return (this.page - 1) * this.limit;
  }

  getTake() {
    return this.limit;
  }

  getPaginationMeta(total: number) {
    return {
      page: this.page,
      limit: this.limit,
      total,
      totalPage: Math.ceil(total / this.limit),
    };
  }
}