export interface QueryOptions {
  page?: number | string;
  limit?: number | string;
  searchTerm?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: unknown;
}

export const buildPrismaQuery = (
  query: QueryOptions,
  searchFields: string[] = [],
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;
  const { searchTerm, sortBy, sortOrder, ...filters } = query;

  delete filters.page;
  delete filters.limit;

  const where: Record<string, unknown> = {};

  for (const key in filters) {
    if (filters[key] !== undefined && filters[key] !== '') {
      where[key] = filters[key];
    }
  }

  if (searchTerm && searchFields.length > 0) {
    where.OR = searchFields.map((field) => ({
      [field]: { contains: String(searchTerm), mode: 'insensitive' },
    }));
  }

  const orderBy: Record<string, 'asc' | 'desc'> = sortBy
    ? { [sortBy]: sortOrder || 'desc' }
    : { createdAt: 'desc' };

  return {
    where,
    skip,
    take: limit,
    orderBy,
    page,
    limit,
  };
};

export const calculatePaginationMeta = (
  total: number,
  page: number,
  limit: number,
) => {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};
