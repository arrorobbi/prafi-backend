import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { Tenant } from './tenant.model';

export class TenantCategory extends Model<
  InferAttributes<TenantCategory>,
  InferCreationAttributes<TenantCategory>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Relations (populated when loaded with `include`)
  declare tenants?: NonAttribute<Tenant[]>;

  static associate({ Tenant }: DbModels) {
    // tenants.tenant_category_id > tenant_categories.id (one category has many tenants)
    TenantCategory.hasMany(Tenant, { as: 'tenants', foreignKey: 'tenantCategoryId' });
  }
}

TenantCategory.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { notEmpty: true } },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'tenant_categories', modelName: 'TenantCategory' },
);
