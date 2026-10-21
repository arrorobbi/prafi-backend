import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { Product } from './product.model';

/** One switch of a product between "Tersedia" and "Stok Kosong" by its seller (the dashboards' Aktivitas chart). */
export class ProductStockEvent extends Model<InferAttributes<ProductStockEvent>, InferCreationAttributes<ProductStockEvent>> {
  declare id: CreationOptional<number>;
  declare productId: ForeignKey<Product['id']>;
  /** The new value: false = marked "Stok Kosong", true = "Tersedia" again */
  declare isAvailable: boolean;
  declare createdAt: CreationOptional<Date>;

  static associate({ Product }: DbModels) {
    // product_stock_events.product_id > products.id (deleted with the product)
    ProductStockEvent.belongsTo(Product, { as: 'product', foreignKey: 'productId', onDelete: 'CASCADE' });
  }
}

ProductStockEvent.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.UUID, allowNull: false, references: { model: 'products', key: 'id' } },
    isAvailable: { type: DataTypes.BOOLEAN, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'product_stock_events', modelName: 'ProductStockEvent', updatedAt: false },
);
