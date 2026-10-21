import { sequelize } from '../config/database';
import { ApiLog } from './apiLog.model';
import { Approval } from './approval.model';
import { GuideSection } from './guideSection.model';
import { GuideStep } from './guideStep.model';
import { Image } from './image.model';
import { Notification } from './notification.model';
import { Otp } from './otp.model';
import { Product } from './product.model';
import { ProductCategory } from './productCategory.model';
import { ProductStockEvent } from './productStockEvent.model';
import { Review } from './review.model';
import { RevokedToken } from './revokedToken.model';
import { SiteSetting } from './siteSetting.model';
import { Tenant } from './tenant.model';
import { User } from './user.model';

const models = { ApiLog, Approval, GuideSection, GuideStep, Image, Notification, Otp, Product, ProductCategory, ProductStockEvent, Review, RevokedToken, SiteSetting, Tenant, User };

export type DbModels = typeof models;

// Relations are defined in each model's static associate()
Object.values(models).forEach((model) => model.associate(models));

export { sequelize, ApiLog, Approval, GuideSection, GuideStep, Image, Notification, Otp, Product, ProductCategory, ProductStockEvent, Review, RevokedToken, SiteSetting, Tenant, User };
