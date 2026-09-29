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
import type { Tenant } from './tenant.model';

export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string;
  declare details: string;
  declare qty: number;
  declare imageId: ForeignKey<Image['id']> | null;
  declare approvalId: ForeignKey<Approval['id']> | null;
  declare tenantId: ForeignKey<Tenant['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare image?: NonAttribute<Image>;
  declare approval?: NonAttribute<Approval>;
  declare tenant?: NonAttribute<Tenant>;

  static associate({ Image, Approval, Tenant }: DbModels) {
    // products.image_id - images.id (one-to-one)
    Product.belongsTo(Image, { as: 'image', foreignKey: 'imageId', onDelete: 'SET NULL' });
    // products.approval_id - approvals.id (one-to-one)
    Product.belongsTo(Approval, { as: 'approval', foreignKey: 'approvalId', onDelete: 'SET NULL' });
    // products.tenant_id > tenants.id (many products per tenant)
    Product.belongsTo(Tenant, { as: 'tenant', foreignKey: 'tenantId', onDelete: 'CASCADE' });
  }
}

Product.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.STRING, allowNull: false },
    details: { type: DataTypes.STRING, allowNull: false },
    qty: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
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
      references: { model: 'tenants', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'products', modelName: 'Product' },
);
