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

/** What an approval is for. A user has one 'user' approval (their account) and one 'product' approval per product. */
export const APPROVAL_KINDS = ['user', 'product'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export class Approval extends Model<InferAttributes<Approval>, InferCreationAttributes<Approval>> {
  declare id: CreationOptional<number>;
  declare reason: string;
  /** New approvals start inactive (false) until a superadmin/admin activates them. */
  declare isActive: CreationOptional<boolean>;
  /** 'user' = the account approval of userId, 'product' = the approval of a product owned by userId. */
  declare type: CreationOptional<ApprovalKind>;
  /** The account owner ('user'), or the tenant who owns the product ('product'). */
  declare userId: ForeignKey<User['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare product?: NonAttribute<Product>;
  declare user?: NonAttribute<User>;
  declare notifications?: NonAttribute<Notification[]>;

  static associate({ Product, User, Notification }: DbModels) {
    // products.approval_id - approvals.id (one-to-one)
    Approval.hasOne(Product, { as: 'product', foreignKey: 'approvalId' });
    // approvals.user_id > users.id (one account approval + one per product; deleting the user deletes them)
    Approval.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
    // notifications.approval_id > approvals.id (one approval, many notifications)
    Approval.hasMany(Notification, { as: 'notifications', foreignKey: 'approvalId' });
  }
}

Approval.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reason: { type: DataTypes.STRING, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    type: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'user', validate: { isIn: [APPROVAL_KINDS as unknown as string[]] } },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'approvals',
    modelName: 'Approval',
    indexes: [
      // Only one account approval per user; product approvals of the same user are not limited
      { name: 'approvals_user_id_account', unique: true, fields: ['user_id'], where: { type: 'user' } },
    ],
  },
);
