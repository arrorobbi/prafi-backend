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
import type { NotificationEntityType, NotificationType } from '../constants/notifications';
import type { DbModels } from '.';
import type { Approval } from './approval.model';
import type { User } from './user.model';

/** One row per recipient: when an event concerns several users, each gets their own notification and read state. */
export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  declare id: CreationOptional<number>;
  /** Event code the frontend can switch on, e.g. PRODUCT_SUBMITTED (see constants/notifications). */
  declare type: NotificationType;
  /** Title shown to the user. */
  declare name: string;
  /** Message shown to the user. */
  declare description: string;
  /** Recipient. */
  declare userId: ForeignKey<User['id']>;
  /** Set on activation notifications: the approval to activate/deactivate (current status in approval.isActive). */
  declare approvalId: ForeignKey<Approval['id']> | null;
  /** What the notification is about, so the frontend can link to it (e.g. 'product' + product id). */
  declare entityType: NotificationEntityType | null;
  declare entityId: string | null;
  declare readAt: Date | null;
  declare isRead: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare user?: NonAttribute<User>;
  declare approval?: NonAttribute<Approval>;

  static associate({ User, Approval }: DbModels) {
    // notifications.user_id > users.id (many notifications per user)
    Notification.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
    // notifications.approval_id > approvals.id (many-to-one: every recipient's copy points to the same approval)
    Notification.belongsTo(Approval, { as: 'approval', foreignKey: 'approvalId', onDelete: 'SET NULL' });
  }
}

Notification.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING(64), allowNull: false },
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
      references: { model: 'approvals', key: 'id' },
    },
    entityType: { type: DataTypes.STRING(32), allowNull: true },
    entityId: { type: DataTypes.STRING(64), allowNull: true },
    readAt: { type: DataTypes.DATE, allowNull: true },
    isRead: {
      type: DataTypes.VIRTUAL,
      get(this: Notification) {
        return this.getDataValue('readAt') != null;
      },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'notifications',
    modelName: 'Notification',
    indexes: [
      { name: 'notifications_user_id_created_at', fields: ['user_id', 'created_at'] },
      { name: 'notifications_user_id_read_at', fields: ['user_id', 'read_at'] },
      { name: 'notifications_approval_id', fields: ['approval_id'] },
    ],
  },
);
