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
import type { Approval } from './approval.model';
import type { Image } from './image.model';
import type { Review } from './review.model';
import type { User } from './user.model';

export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string;
  declare details: string;
  /** In rupiah (IDR), whole numbers only. */
  declare price: number;
  /** Set by the owning tenant: shown in the landing page's recommended products. */
  declare isRecommended: CreationOptional<boolean>;
  declare imageId: ForeignKey<Image['id']> | null;
  declare approvalId: ForeignKey<Approval['id']> | null;
  /** The tenant user who owns this product. */
  declare tenantId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare image?: NonAttribute<Image>;
  declare approval?: NonAttribute<Approval>;
  declare tenant?: NonAttribute<User>;
  declare reviews?: NonAttribute<Review[]>;

  static associate({ Image, Approval, User, Review }: DbModels) {
    // products.image_id - images.id (one-to-one)
    Product.belongsTo(Image, { as: 'image', foreignKey: 'imageId', onDelete: 'SET NULL' });
    // products.approval_id - approvals.id (one-to-one)
    Product.belongsTo(Approval, { as: 'approval', foreignKey: 'approvalId', onDelete: 'SET NULL' });
    // products.tenant_id > users.id (a tenant user has many products; deleting the user deletes them)
    Product.belongsTo(User, { as: 'tenant', foreignKey: 'tenantId', onDelete: 'CASCADE' });
    // reviews.product_id > products.id (a product has many reviews; deleting the product deletes them)
    Product.hasMany(Review, { as: 'reviews', foreignKey: 'productId', onDelete: 'CASCADE' });
  }
}

Product.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.STRING, allowNull: false },
    details: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
    isRecommended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    imageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'images', key: 'id' },
    },
    approvalId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'approvals', key: 'id' },
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'products', modelName: 'Product' },
);
