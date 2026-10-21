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
import type { Approval } from './approval.model';
import type { Image } from './image.model';
import type { ProductCategory } from './productCategory.model';
import type { Review } from './review.model';
import type { User } from './user.model';

export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<string>;
  declare name: string;
  /**
   * The readable part of the product's address (/produk/<slug>), made from the name by the hook below; a number is
   * added when taken (brownis-prafi-1). Null only on rows saved by a backend version from before slugs.
   */
  declare slug: CreationOptional<string | null>;
  declare description: string;
  declare details: string;
  /** In rupiah (IDR), whole numbers only. */
  declare price: number;
  /**
   * Set by the server, never by the tenant: true while the product's reviews average RECOMMENDED_MIN_RATING
   * stars or more (recomputed on every new review). Shown in the landing page's recommended products.
   */
  declare isRecommended: CreationOptional<boolean>;
  /**
   * Set by the seller: true = "Tersedia" (in stock), false = "Stok Kosong" (out of stock). Out-of-stock products are
   * hidden from every public page (lists, detail, UMKM counts, new reviews) until they are available again.
   */
  declare isAvailable: CreationOptional<boolean>;
  /** The product category (created by an admin). Required for new products; null only for older ones. */
  declare categoryId: ForeignKey<ProductCategory['id']> | null;
  declare imageId: ForeignKey<Image['id']> | null;
  declare approvalId: ForeignKey<Approval['id']> | null;
  /** The tenant user who owns this product. */
  declare tenantId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare image?: NonAttribute<Image>;
  declare category?: NonAttribute<ProductCategory>;
  declare approval?: NonAttribute<Approval>;
  declare tenant?: NonAttribute<User>;
  declare reviews?: NonAttribute<Review[]>;

  static associate({ Image, Approval, ProductCategory, User, Review }: DbModels) {
    // products.image_id - images.id (one-to-one)
    Product.belongsTo(Image, { as: 'image', foreignKey: 'imageId', onDelete: 'SET NULL' });
    // products.category_id > product_categories.id (many products per category; a category in use can't be deleted)
    Product.belongsTo(ProductCategory, { as: 'category', foreignKey: 'categoryId', onDelete: 'RESTRICT' });
    // products.approval_id - approvals.id (one-to-one)
    Product.belongsTo(Approval, { as: 'approval', foreignKey: 'approvalId', onDelete: 'SET NULL' });
    // products.tenant_id > users.id (a tenant user has many products; deleting the user deletes them)
    Product.belongsTo(User, { as: 'tenant', foreignKey: 'tenantId', onDelete: 'CASCADE' });
    // reviews.product_id > products.id (a product has many reviews; deleting the product deletes them)
    Product.hasMany(Review, { as: 'reviews', foreignKey: 'productId', onDelete: 'CASCADE' });
  }
}

Product.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    slug: { type: DataTypes.STRING(120), allowNull: true, unique: true },
    description: { type: DataTypes.STRING, allowNull: false },
    details: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
    isRecommended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    imageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'images', key: 'id' },
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'product_categories', key: 'id' },
    },
    approvalId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'approvals', key: 'id' },
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'products', modelName: 'Product' },
);

// A new product, or a renamed one, gets the first free slug for its name
Product.beforeSave(async (product, options) => {
  if (!product.name || !(product.isNewRecord || product.changed('name') || !product.slug)) return;
  const base = slugify(product.name, 'produk');
  const before = product.isNewRecord ? null : product.slug;
  // Renamed to something with the same slug words (e.g. only capitals changed): keep the address
  if (before && (before === base || before.replace(/-\d+$/, '') === base)) return;
  const transaction = hookTransaction(options);
  product.slug = await freeSlug(Product, 'product', base, { exceptId: product.isNewRecord ? undefined : product.id, transaction });
  saveSlugToo(options);
  // The address it had keeps working (and stays reserved for it)
  if (!product.isNewRecord) await keepOldSlug('product', product.id, before, product.slug, transaction);
});

// Deleted: its old addresses are free again
Product.afterDestroy(async (product, options) => forgetOldSlugs('product', product.id, hookTransaction(options)));
