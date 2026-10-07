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

export const LOG_LEVELS = ['info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * One row per API request, written by the requestLogger middleware when the response finishes.
 * A failed request carries its error on the same row (errorStack only for 5xx). Request bodies are never stored.
 * Read by the superadmin through GET /api/logs; rows older than LOG_RETENTION_DAYS are purged.
 */
export class ApiLog extends Model<InferAttributes<ApiLog>, InferCreationAttributes<ApiLog>> {
  declare id: CreationOptional<number>;
  /** From the status: info < 400, warn 4xx, error 5xx */
  declare level: LogLevel;
  declare method: string;
  /** Without the query string */
  declare path: string;
  /** The query string with secrets (token, otp, password) masked; null when there is none */
  declare query: string | null;
  declare statusCode: number;
  declare durationMs: number;
  declare userId: ForeignKey<User['id']> | null;
  /** Copied at request time, so the log still says who it was after the account changes or is deleted */
  declare userEmail: string | null;
  declare userRole: string | null;
  declare ip: string | null;
  declare userAgent: string | null;
  declare errorCode: string | null;
  declare errorMessage: string | null;
  declare errorDetails: unknown;
  declare errorStack: string | null;
  declare createdAt: CreationOptional<Date>;

  static associate({ User }: DbModels) {
    // api_logs.user_id > users.id (the log outlives the account: deleting the user keeps its logs)
    ApiLog.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'SET NULL' });
  }
}

ApiLog.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    level: { type: DataTypes.STRING(10), allowNull: false, validate: { isIn: [LOG_LEVELS as unknown as string[]] } },
    method: { type: DataTypes.STRING(10), allowNull: false },
    path: { type: DataTypes.TEXT, allowNull: false },
    query: { type: DataTypes.TEXT, allowNull: true },
    statusCode: { type: DataTypes.INTEGER, allowNull: false },
    durationMs: { type: DataTypes.INTEGER, allowNull: false },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    userEmail: { type: DataTypes.STRING, allowNull: true },
    userRole: { type: DataTypes.STRING(20), allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.TEXT, allowNull: true },
    errorCode: { type: DataTypes.STRING(64), allowNull: true },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    errorDetails: { type: DataTypes.JSONB, allowNull: true },
    errorStack: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'api_logs',
    modelName: 'ApiLog',
    // Written once, never updated
    updatedAt: false,
    indexes: [{ fields: ['created_at'] }, { fields: ['status_code'] }, { fields: ['user_id'] }],
  },
);
