import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { GuideSection } from './guideSection.model';
import type { Image } from './image.model';

/**
 * One numbered step of a guide topic, with an optional screenshot for wide screens (desktopImage) and one for phones
 * (mobileImage). A replaced or removed picture is deleted from the disk too.
 */
export class GuideStep extends Model<InferAttributes<GuideStep>, InferCreationAttributes<GuideStep>> {
  declare id: CreationOptional<number>;
  declare sectionId: ForeignKey<GuideSection['id']>;
  /** Paragraphs, "- " lists, **bold**, [links](/path) */
  declare body: string;
  /** Describes the pictures (screen readers, and when a picture can't load) */
  declare imageAlt: CreationOptional<string | null>;
  declare desktopImageId: ForeignKey<Image['id']> | null;
  declare mobileImageId: ForeignKey<Image['id']> | null;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare desktopImage?: NonAttribute<Image | null>;
  declare mobileImage?: NonAttribute<Image | null>;

  static associate({ GuideSection, Image }: DbModels) {
    GuideStep.belongsTo(GuideSection, { as: 'section', foreignKey: 'sectionId', onDelete: 'CASCADE' });
    // guide_steps.desktop_image_id / mobile_image_id - images.id (one-to-one each)
    GuideStep.belongsTo(Image, { as: 'desktopImage', foreignKey: 'desktopImageId', onDelete: 'SET NULL' });
    GuideStep.belongsTo(Image, { as: 'mobileImage', foreignKey: 'mobileImageId', onDelete: 'SET NULL' });
  }
}

GuideStep.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sectionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'guide_sections', key: 'id' } },
    body: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    imageAlt: { type: DataTypes.STRING(255), allowNull: true },
    desktopImageId: { type: DataTypes.INTEGER, allowNull: true, unique: true, references: { model: 'images', key: 'id' } },
    mobileImageId: { type: DataTypes.INTEGER, allowNull: true, unique: true, references: { model: 'images', key: 'id' } },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'guide_steps', modelName: 'GuideStep' },
);
