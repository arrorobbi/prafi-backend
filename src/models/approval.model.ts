import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { Notification } from './notification.model';
import type { Product } from './product.model';

export class Approval extends Model<InferAttributes<Approval>, InferCreationAttributes<Approval>> {
  declare id: CreationOptional<number>;
  declare reason: string;
  declare isActive: CreationOptional<boolean | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare product?: NonAttribute<Product>;
  declare notification?: NonAttribute<Notification>;

  static associate({ Product, Notification }: DbModels) {
    // products.approval_id - approvals.id (one-to-one)
    Approval.hasOne(Product, { as: 'product', foreignKey: 'approvalId' });
    // notifications.approval_id - approvals.id (one-to-one)
    Approval.hasOne(Notification, { as: 'notification', foreignKey: 'approvalId' });
  }
}

Approval.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reason: { type: DataTypes.STRING, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'approvals', modelName: 'Approval' },
);
