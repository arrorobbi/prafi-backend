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
import type { Product } from './product.model';
import type { User } from './user.model';

export const MIN_STARS = 1;
export const MAX_STARS = 5;

/** A seller's report on a review: waiting for an admin / disnakertrans, or their decision */
export const REPORT_STATUSES = ['pending', 'kept', 'hidden'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * A visitor's review of an approved product. Public: written and read without logging in. A seller can report one,
 * and an admin / disnakertrans can hide it (it then no longer shows or counts in ratings).
 */
export class Review extends Model<InferAttributes<Review>, InferCreationAttributes<Review>> {
  declare id: CreationOptional<number>;
  declare productId: ForeignKey<Product['id']>;
  /** The reviewer's name, as they typed it */
  declare name: string;
  /** 1 to 5 */
  declare stars: number;
  declare review: string;
  /** The posting browser's random id (kept in its localStorage); with ipHash, one review per product per day */
  declare clientId: string | null;
  /** SHA-256 of the visitor's IP (with a server secret): the IP itself is never stored */
  declare ipHash: string | null;
  /** Hidden by an admin / disnakertrans: not shown, not counted in ratings or the recommendation */
  declare isHidden: CreationOptional<boolean>;
  /** null = never reported */
  declare reportStatus: ReportStatus | null;
  declare reportReason: string | null;
  declare reportedAt: Date | null;
  declare reportedBy: ForeignKey<User['id']> | null;
  declare moderatedAt: Date | null;
  declare moderatedBy: ForeignKey<User['id']> | null;
  declare moderationNote: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare product?: NonAttribute<Product & { tenant?: User | null }>;

  static associate({ Product, User }: DbModels) {
    // reviews.product_id > products.id (many reviews per product; deleting the product deletes them)
    Review.belongsTo(Product, { as: 'product', foreignKey: 'productId', onDelete: 'CASCADE' });
    // reviews.reported_by / moderated_by > users.id (the review stays when the account is deleted)
    Review.belongsTo(User, { as: 'reporter', foreignKey: 'reportedBy', onDelete: 'SET NULL' });
    Review.belongsTo(User, { as: 'moderator', foreignKey: 'moderatedBy', onDelete: 'SET NULL' });
  }
}

Review.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'products', key: 'id' },
    },
    name: { type: DataTypes.STRING(100), allowNull: false, validate: { notEmpty: true } },
    stars: { type: DataTypes.INTEGER, allowNull: false, validate: { min: MIN_STARS, max: MAX_STARS } },
    review: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    clientId: { type: DataTypes.STRING(64), allowNull: true },
    ipHash: { type: DataTypes.STRING(64), allowNull: true },
    isHidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reportStatus: { type: DataTypes.STRING(10), allowNull: true, validate: { isIn: [REPORT_STATUSES as unknown as string[]] } },
    reportReason: { type: DataTypes.TEXT, allowNull: true },
    reportedAt: { type: DataTypes.DATE, allowNull: true },
    reportedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    moderatedAt: { type: DataTypes.DATE, allowNull: true },
    moderatedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    moderationNote: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'reviews',
    modelName: 'Review',
    indexes: [{ fields: ['product_id'] }, { fields: ['ip_hash', 'created_at'] }, { fields: ['report_status'] }],
    // Public responses never include who posted (browser id / IP hash)
    defaultScope: { attributes: { exclude: ['clientId', 'ipHash'] } },
  },
);
