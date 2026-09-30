import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import type { DbModels } from '.';
import type { Product } from './product.model';
import type { Tenant } from './tenant.model';
import type { User } from './user.model';

export class Image extends Model<InferAttributes<Image>, InferCreationAttributes<Image>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare imgUrl: string;
  declare altText: string;
  /** Absolute link for the frontend, e.g. http://localhost:4000/images/<file> (not stored in the DB). */
  declare url: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare user?: NonAttribute<User>;
  declare product?: NonAttribute<Product>;
  declare tenant?: NonAttribute<Tenant>;

  static associate({ User, Product, Tenant }: DbModels) {
    // users.face_image_id - images.id (one-to-one)
    Image.hasOne(User, { as: 'user', foreignKey: 'faceImageId' });
    // tenants.logo_id - images.id (one-to-one)
    Image.hasOne(Tenant, { as: 'tenant', foreignKey: 'logoId' });
    // products.image_id - images.id (one-to-one)
    Image.hasOne(Product, { as: 'product', foreignKey: 'imageId' });
  }
}

Image.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    imgUrl: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    altText: { type: DataTypes.STRING, allowNull: false },
    url: {
      type: DataTypes.VIRTUAL,
      get(this: Image) {
        const imgUrl = this.getDataValue('imgUrl');
        if (!imgUrl) return undefined;
        return /^https?:\/\//.test(imgUrl) ? imgUrl : `${env.appUrl}${imgUrl}`;
      },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'images', modelName: 'Image' },
);
