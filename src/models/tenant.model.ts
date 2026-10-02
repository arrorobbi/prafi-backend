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
import type { Image } from './image.model';
import type { TenantCategory } from './tenantCategory.model';
import type { User } from './user.model';

/** A tenant user's tenant profile. Products belong to the tenant user, not to this profile. */
export class Tenant extends Model<InferAttributes<Tenant>, InferCreationAttributes<Tenant>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string;
  declare address: string;
  declare area: string;
  declare operationalHours: string;
  declare fbLink: string;
  declare whatsappLink: string;
  declare gmapsLink: string;
  /** Required: upload the logo first via POST /api/images. */
  declare logoId: ForeignKey<Image['id']>;
  declare categoryId: ForeignKey<TenantCategory['id']>;
  declare userId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare logo?: NonAttribute<Image>;
  declare category?: NonAttribute<TenantCategory>;
  declare owner?: NonAttribute<User>;

  static associate({ Image, TenantCategory, User }: DbModels) {
    // tenants.logo_id - images.id (one-to-one; the logo is required, so an image in use as a logo can't be deleted)
    Tenant.belongsTo(Image, { as: 'logo', foreignKey: 'logoId', onDelete: 'RESTRICT' });
    // tenants.category_id > tenant_categories.id (many tenants per category; a category in use can't be deleted)
    Tenant.belongsTo(TenantCategory, { as: 'category', foreignKey: 'categoryId', onDelete: 'RESTRICT' });
    // tenants.user_id - users.id (one-to-one; deleting the user deletes the tenant)
    Tenant.belongsTo(User, { as: 'owner', foreignKey: 'userId', onDelete: 'CASCADE' });
  }
}

Tenant.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.STRING, allowNull: false },
    area: { type: DataTypes.STRING, allowNull: false },
    operationalHours: { type: DataTypes.STRING, allowNull: false },
    fbLink: { type: DataTypes.STRING, allowNull: false },
    whatsappLink: { type: DataTypes.STRING, allowNull: false },
    gmapsLink: { type: DataTypes.STRING, allowNull: false },
    logoId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'images', key: 'id' },
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'tenant_categories', key: 'id' },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'users', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'tenants', modelName: 'Tenant' },
);
