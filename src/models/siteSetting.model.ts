import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { User } from './user.model';

/**
 * Small key/value settings of the site: texts staff can edit (e.g. the footer's "about" text) and internal markers
 * (e.g. the last bounce email already read from the inbox).
 */
export class SiteSetting extends Model<InferAttributes<SiteSetting>, InferCreationAttributes<SiteSetting>> {
  declare key: string;
  declare value: string;
  /** Who changed it last; null for values the server writes itself. */
  declare updatedBy: ForeignKey<User['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static associate({ User }: DbModels) {
    // site_settings.updated_by > users.id (kept when the user is deleted)
    SiteSetting.belongsTo(User, { as: 'editor', foreignKey: 'updatedBy', onDelete: 'SET NULL' });
  }
}

SiteSetting.init(
  {
    key: { type: DataTypes.STRING(64), primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: false },
    updatedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'site_settings', modelName: 'SiteSetting' },
);
