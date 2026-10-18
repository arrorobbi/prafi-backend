import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import type { DbModels } from '.';
import type { GuideStep } from './guideStep.model';
import type { User } from './user.model';

/** Where a guide topic is shown: public = /panduan, tenant = "Bantuan & Ketentuan" in the seller dashboard. */
export const GUIDE_AUDIENCES = ['public', 'tenant'] as const;
export type GuideAudience = (typeof GUIDE_AUDIENCES)[number];

/** Icon names the frontend can draw (GuideList's icon map). */
export const GUIDE_ICONS = [
  'search', 'user', 'users', 'store', 'plus', 'check', 'bell', 'camera', 'lock', 'settings', 'docs', 'headset',
  'help', 'box', 'tag', 'message', 'calculator', 'home', 'heart', 'map',
] as const;
export type GuideIcon = (typeof GUIDE_ICONS)[number];

/**
 * One topic of the Panduan (help pages), e.g. "Cara Mendaftar sebagai Penjual": an optional intro text, numbered
 * steps (GuideStep) and an optional closing text. Edited in "Kelola Panduan".
 */
export class GuideSection extends Model<InferAttributes<GuideSection>, InferCreationAttributes<GuideSection>> {
  declare id: CreationOptional<number>;
  /** Anchor on /panduan (/panduan#<slug>); made once from the title, so links keep working after a rename */
  declare slug: string;
  declare title: string;
  declare summary: CreationOptional<string>;
  declare icon: CreationOptional<GuideIcon>;
  declare color: CreationOptional<string>;
  declare audience: CreationOptional<GuideAudience[]>;
  /** Text before the steps / after them: paragraphs, "- " lists, **bold**, [links](/path) */
  declare intro: CreationOptional<string | null>;
  declare outro: CreationOptional<string | null>;
  declare sortOrder: CreationOptional<number>;
  declare updatedBy: ForeignKey<User['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare steps?: NonAttribute<GuideStep[]>;

  static associate({ GuideStep, User }: DbModels) {
    // guide_steps.section_id > guide_sections.id (deleting a section deletes its steps)
    GuideSection.hasMany(GuideStep, { as: 'steps', foreignKey: 'sectionId', onDelete: 'CASCADE' });
    // guide_sections.updated_by > users.id (kept when the user is deleted)
    GuideSection.belongsTo(User, { as: 'editor', foreignKey: 'updatedBy', onDelete: 'SET NULL' });
  }
}

GuideSection.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
    summary: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    icon: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'docs', validate: { isIn: [GUIDE_ICONS as unknown as string[]] } },
    color: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#0e3c69', validate: { is: /^#[0-9a-f]{6}$/i } },
    audience: { type: DataTypes.ARRAY(DataTypes.STRING(16)), allowNull: false, defaultValue: ['public'] },
    intro: { type: DataTypes.TEXT, allowNull: true },
    outro: { type: DataTypes.TEXT, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    updatedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'guide_sections', modelName: 'GuideSection' },
);
