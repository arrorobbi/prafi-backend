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
import type { User } from './user.model';

export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string;
  declare userId: ForeignKey<User['id']>;
  declare approvalId: ForeignKey<Approval['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare user?: NonAttribute<User>;
  declare approval?: NonAttribute<Approval>;

  static associate({ User, Approval }: DbModels) {
    // notifications.user_id > users.id (many notifications per user)
    Notification.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
    // notifications.approval_id - approvals.id (one-to-one)
    Notification.belongsTo(Approval, { as: 'approval', foreignKey: 'approvalId', onDelete: 'SET NULL' });
  }
}

Notification.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: false },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    approvalId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'approvals', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'notifications', modelName: 'Notification' },
);
