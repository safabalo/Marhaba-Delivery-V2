import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createCategorySchema,
  createProductSchema,
  listProductsQuerySchema,
  updateCategorySchema,
  updateProductSchema,
  UserRole,
  type CreateCategoryInput,
  type CreateProductInput,
  type ListProductsQuery,
  type UpdateCategoryInput,
  type UpdateProductInput,
} from '@marhaba/shared';
import { Public, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { CatalogService } from './catalog.service';

@Controller()
@UseGuards(RolesGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // --- Categories ----------------------------------------------------------

  @Public()
  @Get('categories')
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post('categories')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createCategory(@Body(zodBody(createCategorySchema)) body: CreateCategoryInput) {
    return this.catalog.createCategory(body);
  }

  @Patch('categories/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateCategory(
    @Param('id') id: string,
    @Body(zodBody(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.catalog.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  deleteCategory(@Param('id') id: string) {
    return this.catalog.deleteCategory(id);
  }

  // --- Products ------------------------------------------------------------

  @Public()
  @Get('products')
  listProducts(@Query(zodBody(listProductsQuerySchema)) query: ListProductsQuery) {
    return this.catalog.listProducts(query);
  }

  @Public()
  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }

  @Post('products')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createProduct(@Body(zodBody(createProductSchema)) body: CreateProductInput) {
    return this.catalog.createProduct(body);
  }

  @Patch('products/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateProduct(
    @Param('id') id: string,
    @Body(zodBody(updateProductSchema)) body: UpdateProductInput,
  ) {
    return this.catalog.updateProduct(id, body);
  }

  @Delete('products/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  deleteProduct(@Param('id') id: string) {
    return this.catalog.deleteProduct(id);
  }
}
