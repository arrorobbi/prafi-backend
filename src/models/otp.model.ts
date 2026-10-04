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
import type { User } from './user.model';

/**
 * 'otp' = 6-digit email verification code (admin/tenant), 'link' = email activation link token (disnakertrans),
 * 'reset' = forgot-password link token.
 */
export const OTP_PURPOSES = ['otp', 'link', 'reset'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/**
 * An emailed code or link token (email verification or password reset). Only a SHA-256 hash is stored, so a leaked table can't be used
 * to verify an email or reset a password. A code is single-use, expires, and allows a limited number of attempts.
 */
export class Otp extends Model<InferAttributes<Otp>, InferCreationAttributes<Otp>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare purpose: OtpPurpose;
  /** SHA-256 of the code (otp) or token (link). */
  declare code: string;
  declare expiresAt: Date;
  /** Wrong guesses so far (otp only). */
  declare attempts: CreationOptional<number>;
  declare usedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare user?: NonAttribute<User>;

  static associate({ User }: DbModels) {
    // otps.user_id > users.id (a user can have several codes over time; deleting the user deletes them)
    Otp.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
  }
}

Otp.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    purpose: { type: DataTypes.STRING(16), allowNull: false, validate: { isIn: [OTP_PURPOSES as unknown as string[]] } },
    code: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'otps',
    modelName: 'Otp',
    indexes: [{ name: 'otps_user_id_created_at', fields: ['user_id', 'created_at'] }],
  },
);
