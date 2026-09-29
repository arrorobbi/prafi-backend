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
import { ALL_ROLES, Role } from '../constants/roles';
import type { DbModels } from '.';
import type { Image } from './image.model';
import type { Notification } from './notification.model';
import type { Tenant } from './tenant.model';

const SALT_ROUNDS = 12;

/** A user's role is set once at registration and can never be changed afterwards. */
function roleIsImmutable(value: unknown, instance: Model | null = null): never {
  const message = 'role cannot be changed';
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
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare faceImage?: NonAttribute<Image>;
  declare tenant?: NonAttribute<Tenant>;
  declare notifications?: NonAttribute<Notification[]>;

  static associate({ Image, Tenant, Notification }: DbModels) {
    // users.face_image_id - images.id (one-to-one)
    User.belongsTo(Image, { as: 'faceImage', foreignKey: 'faceImageId', onDelete: 'SET NULL' });
    // tenants.user_id - users.id (one-to-one)
    User.hasOne(Tenant, { as: 'tenant', foreignKey: 'userId' });
    // notifications.user_id > users.id (one user has many notifications)
    User.hasMany(Notification, { as: 'notifications', foreignKey: 'userId' });
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
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'users',
    modelName: 'User',
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
