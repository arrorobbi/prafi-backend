import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { Product } from './product.model';

export const MIN_STARS = 1;
export const MAX_STARS = 5;

/** A visitor's review of an approved product. Public: written and read without logging in. */
export class Review extends Model<InferAttributes<Review>, InferCreationAttributes<Review>> {
  declare id: CreationOptional<number>;
  declare productId: ForeignKey<Product['id']>;
  /** The reviewer's name, as they typed it */
  declare name: string;
  /** 1 to 5 */
  declare stars: number;
  declare review: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static associate({ Product }: DbModels) {
    // reviews.product_id > products.id (many reviews per product; deleting the product deletes them)
    Review.belongsTo(Product, { as: 'product', foreignKey: 'productId', onDelete: 'CASCADE' });
  }
}

Review.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'products', key: 'id' },
    },
    name: { type: DataTypes.STRING(100), allowNull: false, validate: { notEmpty: true } },
    stars: { type: DataTypes.INTEGER, allowNull: false, validate: { min: MIN_STARS, max: MAX_STARS } },
    review: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'reviews', modelName: 'Review', indexes: [{ fields: ['product_id'] }] },
);
