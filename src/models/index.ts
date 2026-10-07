import { sequelize } from '../config/database';
import { ApiLog } from './apiLog.model';
import { Approval } from './approval.model';
import { Image } from './image.model';
import { Notification } from './notification.model';
import { Otp } from './otp.model';
import { Product } from './product.model';
import { RevokedToken } from './revokedToken.model';
import { Tenant } from './tenant.model';
import { TenantCategory } from './tenantCategory.model';
import { User } from './user.model';

const models = { ApiLog, Approval, Image, Notification, Otp, Product, RevokedToken, Tenant, TenantCategory, User };

export type DbModels = typeof models;

// Relations are defined in each model's static associate()
Object.values(models).forEach((model) => model.associate(models));

export { sequelize, ApiLog, Approval, Image, Notification, Otp, Product, RevokedToken, Tenant, TenantCategory, User };
