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
import type { Notification } from './notification.model';
import type { Product } from './product.model';
import type { User } from './user.model';

export class Approval extends Model<InferAttributes<Approval>, InferCreationAttributes<Approval>> {
  declare id: CreationOptional<number>;
  declare reason: string;
  /** New approvals start inactive (false) until a superadmin/admin activates them. */
  declare isActive: CreationOptional<boolean>;
  /** Set when this approval is for a user account (null for a product's approval). */
  declare userId: ForeignKey<User['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare product?: NonAttribute<Product>;
  declare user?: NonAttribute<User>;
  declare notification?: NonAttribute<Notification>;

  static associate({ Product, User, Notification }: DbModels) {
    // products.approval_id - approvals.id (one-to-one)
    Approval.hasOne(Product, { as: 'product', foreignKey: 'approvalId' });
    // approvals.user_id - users.id (one-to-one; deleting the user deletes their approval)
    Approval.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
    // notifications.approval_id - approvals.id (one-to-one)
    Approval.hasOne(Notification, { as: 'notification', foreignKey: 'approvalId' });
  }
}

Approval.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reason: { type: DataTypes.STRING, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      references: { model: 'users', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'approvals', modelName: 'Approval' },
);
