import { sequelize } from '../config/database';
import { Approval } from './approval.model';
import { Image } from './image.model';
import { Notification } from './notification.model';
import { Product } from './product.model';
import { Tenant } from './tenant.model';
import { TenantCategory } from './tenantCategory.model';
import { User } from './user.model';

const models = { Approval, Image, Notification, Product, Tenant, TenantCategory, User };

export type DbModels = typeof models;

// Relations are defined in each model's static associate()
Object.values(models).forEach((model) => model.associate(models));

export { sequelize, Approval, Image, Notification, Product, Tenant, TenantCategory, User };
