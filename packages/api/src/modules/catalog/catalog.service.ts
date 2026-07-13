import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateCategoryInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateCategoryInput,
  UpdateProductInput,
} from '@marhaba/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Categories ----------------------------------------------------------

  listCategories(activeOnly = true) {
    return this.prisma.category.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createCategory(input: CreateCategoryInput) {
    return this.prisma.category.create({ data: input });
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    await this.ensureCategory(id);
    return this.prisma.category.update({ where: { id }, data: input });
  }

  async deleteCategory(id: string) {
    await this.ensureCategory(id);
    // Soft-delete to preserve product/order references.
    return this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }

  // --- Products ------------------------------------------------------------

  listProducts(query: ListProductsQuery) {
    const where: Prisma.ProductWhereInput = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.availableOnly) where.isAvailable = true;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    return this.prisma.product.findMany({ where, orderBy: { name: 'asc' } });
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async createProduct(input: CreateProductInput) {
    await this.ensureCategory(input.categoryId);
    return this.prisma.product.create({ data: input });
  }

  async updateProduct(id: string, input: UpdateProductInput) {
    await this.getProduct(id);
    return this.prisma.product.update({ where: { id }, data: input });
  }

  async deleteProduct(id: string) {
    await this.getProduct(id);
    return this.prisma.product.update({ where: { id }, data: { isAvailable: false } });
  }

  private async ensureCategory(id: string) {
    const exists = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Category not found');
  }
}
