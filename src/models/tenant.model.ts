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
import { forgetOldSlugs, freeSlug, hookTransaction, keepOldSlug, saveSlugToo, slugify } from '../utils/slug';
import type { DbModels } from '.';
import type { Image } from './image.model';
import type { User } from './user.model';

/** A tenant user's tenant profile. Products belong to the tenant user, not to this profile. */
export class Tenant extends Model<InferAttributes<Tenant>, InferCreationAttributes<Tenant>> {
  declare id: CreationOptional<string>;
  declare name: string;
  /**
   * The readable part of the UMKM's address (/umkm/<slug>), made from the name by the hook below; a number is added
   * when taken (dapur-mama-1). Null only on rows saved by a backend version from before slugs.
   */
  declare slug: CreationOptional<string | null>;
  declare description: string;
  declare address: string;
  declare area: string;
  declare operationalHours: string;
  /** Every link is optional (null when not given) */
  declare fbLink: string | null;
  declare whatsappLink: string | null;
  declare gmapsLink: string | null;
  declare instagramLink: string | null;
  declare googleBusinessLink: string | null;
  declare shopeeLink: string | null;
  /** Required: upload the logo first via POST /api/images. */
  declare logoId: ForeignKey<Image['id']>;
  declare userId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare logo?: NonAttribute<Image>;
  declare owner?: NonAttribute<User>;

  static associate({ Image, User }: DbModels) {
    // tenants.logo_id - images.id (one-to-one; the logo is required, so an image in use as a logo can't be deleted)
    Tenant.belongsTo(Image, { as: 'logo', foreignKey: 'logoId', onDelete: 'RESTRICT' });
    // tenants.user_id - users.id (one-to-one; deleting the user deletes the tenant)
    Tenant.belongsTo(User, { as: 'owner', foreignKey: 'userId', onDelete: 'CASCADE' });
  }
}

Tenant.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    slug: { type: DataTypes.STRING(120), allowNull: true, unique: true },
    description: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.STRING, allowNull: false },
    area: { type: DataTypes.STRING, allowNull: false },
    operationalHours: { type: DataTypes.STRING, allowNull: false },
    fbLink: { type: DataTypes.STRING, allowNull: true },
    whatsappLink: { type: DataTypes.STRING, allowNull: true },
    gmapsLink: { type: DataTypes.STRING, allowNull: true },
    instagramLink: { type: DataTypes.STRING, allowNull: true },
    // TEXT: Google Business links are often far longer than 255 characters
    googleBusinessLink: { type: DataTypes.TEXT, allowNull: true },
    shopeeLink: { type: DataTypes.STRING, allowNull: true },
    logoId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'images', key: 'id' },
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

// A new profile, or a renamed one, gets the first free slug for its name
Tenant.beforeSave(async (tenant, options) => {
  if (!tenant.name || !(tenant.isNewRecord || tenant.changed('name') || !tenant.slug)) return;
  const base = slugify(tenant.name, 'umkm');
  const before = tenant.isNewRecord ? null : tenant.slug;
  // Renamed to something with the same slug words (e.g. only capitals changed): keep the address
  if (before && (before === base || before.replace(/-\d+$/, '') === base)) return;
  const transaction = hookTransaction(options);
  tenant.slug = await freeSlug(Tenant, 'tenant', base, { exceptId: tenant.isNewRecord ? undefined : tenant.id, transaction });
  saveSlugToo(options);
  // The address it had keeps working (and stays reserved for it)
  if (!tenant.isNewRecord) await keepOldSlug('tenant', tenant.id, before, tenant.slug, transaction);
});

// Deleted: its old addresses are free again
Tenant.afterDestroy(async (tenant, options) => forgetOldSlugs('tenant', tenant.id, hookTransaction(options)));
