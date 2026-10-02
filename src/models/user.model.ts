import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  ValidationError,
  ValidationErrorItem,
} from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../config/database';
import { ALL_ROLES, ROLES, Role } from '../constants/roles';
import type { DbModels } from '.';
import type { Approval } from './approval.model';
import type { Image } from './image.model';
import type { Notification } from './notification.model';
import type { Product } from './product.model';
import type { Tenant } from './tenant.model';

const SALT_ROUNDS = 12;

/** A user's role is set once at registration and can never be changed afterwards. */
function roleIsImmutable(value: unknown, instance: Model | null = null): never {
  const message = 'role tidak dapat diubah';
  throw new ValidationError(message, [
    // Bulk updates have no instance; Sequelize accepts null there at runtime
    new ValidationErrorItem(message, 'validation error', 'role', String(value), instance as Model, 'immutable', 'immutable', []),
  ]);
}

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare firstName: string;
  declare lastName: string;
  declare phoneNumber: string;
  declare password: string;
  declare email: string;
  declare role: Role;
  declare faceImageId: ForeignKey<Image['id']> | null;
  /** Tenants only: their tenant name. Required for tenants, always null for other roles. */
  declare tenantName: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare faceImage?: NonAttribute<Image>;
  declare products?: NonAttribute<Product[]>;
  declare notifications?: NonAttribute<Notification[]>;
  declare approval?: NonAttribute<Approval>;
  /** Tenants only: their tenant profile (tenants table). */
  declare tenant?: NonAttribute<Tenant>;

  static associate({ Image, Product, Notification, Approval, Tenant }: DbModels) {
    // users.face_image_id - images.id (one-to-one)
    User.belongsTo(Image, { as: 'faceImage', foreignKey: 'faceImageId', onDelete: 'SET NULL' });
    // products.tenant_id > users.id (a tenant user has many products)
    User.hasMany(Product, { as: 'products', foreignKey: 'tenantId' });
    // notifications.user_id > users.id (one user has many notifications)
    User.hasMany(Notification, { as: 'notifications', foreignKey: 'userId' });
    // approvals.user_id - users.id (one-to-one): user.approval.isActive
    User.hasOne(Approval, { as: 'approval', foreignKey: 'userId' });
    // tenants.user_id - users.id (one-to-one: a tenant user has one tenant profile)
    User.hasOne(Tenant, { as: 'tenant', foreignKey: 'userId' });
  }

  comparePassword(plain: string): Promise<boolean> {
    return bcrypt.compare(plain, this.password);
  }

  /** Safe representation for API responses (never exposes the password hash). */
  toJSON() {
    const { password: _password, ...rest } = this.get({ plain: true });
    return rest as Omit<InferAttributes<User>, 'password'>;
  }
}

User.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    firstName: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    lastName: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    phoneNumber: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    password: { type: DataTypes.STRING, allowNull: false },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
      set(value: string) {
        this.setDataValue('email', value.trim().toLowerCase());
      },
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [ALL_ROLES] },
    },
    faceImageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'images', key: 'id' },
    },
    // Nullable in the table because admins/superadmins have no tenant name; required for tenants (see validate below)
    tenantName: { type: DataTypes.STRING, allowNull: true, validate: { notEmpty: true } },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'users',
    modelName: 'User',
    validate: {
      // Tenants must have a tenant name: required when created and can't be emptied later.
      // Checked only on create/change so older tenants without one can still update other fields.
      tenantNameMatchesRole(this: User) {
        if (this.role === ROLES.TENANT) {
          if ((this.isNewRecord || this.changed('tenantName')) && !this.tenantName?.trim()) {
            throw new Error('tenantName wajib diisi untuk akun tenant');
          }
        } else if (this.tenantName != null) {
          throw new Error('Hanya akun tenant yang memiliki tenantName');
        }
      },
    },
    // Password hash is never loaded unless explicitly requested with User.scope('withPassword')
    defaultScope: { attributes: { exclude: ['password'] } },
    scopes: { withPassword: { attributes: { include: ['password'] } } },
    hooks: {
      // Covers user.update() / user.save() on an existing user
      beforeUpdate(user) {
        if (user.changed('role')) roleIsImmutable(user.role, user);
      },
      // Covers User.update({ role }, { where }) bulk updates
      beforeBulkUpdate(options) {
        // Sequelize passes the values being set as options.attributes (not in the public type)
        const { attributes } = options as { attributes?: Record<string, unknown> };
        if (attributes && 'role' in attributes) roleIsImmutable(attributes.role);
      },
      async beforeSave(user) {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, SALT_ROUNDS);
        }
      },
    },
  },
);
