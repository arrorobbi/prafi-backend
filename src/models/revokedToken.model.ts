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
import type { User } from './user.model';

/**
 * Access tokens that were logged out before they expired. A JWT can't be expired early by itself,
 * so the auth middleware rejects any token whose id (jti) is listed here.
 */
export class RevokedToken extends Model<InferAttributes<RevokedToken>, InferCreationAttributes<RevokedToken>> {
  declare jti: string;
  declare userId: ForeignKey<User['id']>;
  /** The token's own expiry; after this the row is no longer needed and is purged. */
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static associate({ User }: DbModels) {
    // revoked_tokens.user_id > users.id (deleting the user removes their revoked tokens)
    RevokedToken.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
  }
}

RevokedToken.init(
  {
    jti: { type: DataTypes.UUID, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'revoked_tokens', modelName: 'RevokedToken' },
);
