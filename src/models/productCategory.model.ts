import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { Image } from './image.model';
import type { Product } from './product.model';

/** Product categories, managed by admins. Each has an optional image: the landing page carousel shows it. */
export class ProductCategory extends Model<
  InferAttributes<ProductCategory>,
  InferCreationAttributes<ProductCategory>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  /** Optional: upload it first via POST /api/images. Shown in the landing page carousel. */
  declare imageId: ForeignKey<Image['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare image?: NonAttribute<Image>;
  declare products?: NonAttribute<Product[]>;

  static associate({ Image, Product }: DbModels) {
    // product_categories.image_id - images.id (one-to-one)
    ProductCategory.belongsTo(Image, { as: 'image', foreignKey: 'imageId', onDelete: 'SET NULL' });
    // products.category_id > product_categories.id (one category has many products; a category in use can't be deleted)
    ProductCategory.hasMany(Product, { as: 'products', foreignKey: 'categoryId', onDelete: 'RESTRICT' });
  }
}

ProductCategory.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { notEmpty: true } },
    imageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'images', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'product_categories', modelName: 'ProductCategory' },
);
