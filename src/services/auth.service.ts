import bcrypt from 'bcryptjs';
import { CREATABLE_ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { Image, User } from '../models';
import type { AuthUser } from '../types/express';
import { signAccessToken } from '../utils/jwt';

export interface RegisterInput {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  password: string;
  role: Role;
  faceImageId?: number | null;
}

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

export async function login(email: string, password: string) {
  const user = await User.scope('withPassword').findOne({
    where: { email: email.trim().toLowerCase() },
  });

  const passwordOk = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!user || !passwordOk) {
    throw HttpError.unauthorized('Invalid email or password');
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  return { accessToken, tokenType: 'Bearer', user: user.toJSON() };
}

/**
 * Creates a user on behalf of the logged-in `creator`.
 * superadmin → can create admin, admin → can create tenant (see CREATABLE_ROLES).
 */
export async function register(creator: AuthUser, input: RegisterInput) {
  if (!CREATABLE_ROLES[creator.role].includes(input.role)) {
    throw HttpError.forbidden(`Role ${creator.role} cannot create ${input.role} accounts`);
  }

  if (input.faceImageId != null) {
    const image = await Image.findByPk(input.faceImageId, { attributes: ['id'] });
    if (!image) {
      throw HttpError.badRequest('Validation failed', [
        { field: 'faceImageId', message: 'Image not found, upload it first via POST /api/images' },
      ]);
    }
  }

  // Duplicate email / already-used faceImageId → UniqueConstraintError → 409 via the error handler
  const user = await User.create({ ...input, faceImageId: input.faceImageId ?? null });
  return getProfile(user.id);
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  /** New password; requires `currentPassword`. */
  password?: string;
  currentPassword?: string;
  /** Image id from POST /api/images, or null to remove the face image. */
  faceImageId?: number | null;
}

/** Updates the logged-in user's own account. id and role are never changed here. */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw HttpError.notFound('User not found');

  const { currentPassword, ...changes } = input;

  if (changes.password !== undefined && !(await user.comparePassword(currentPassword ?? ''))) {
    throw HttpError.badRequest('Validation failed', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }

  if (changes.faceImageId != null) {
    const image = await Image.findByPk(changes.faceImageId, { attributes: ['id'] });
    if (!image) {
      throw HttpError.badRequest('Validation failed', [
        { field: 'faceImageId', message: 'Image not found, upload it first via POST /api/images' },
      ]);
    }
  }

  // The password is hashed by the model's beforeSave hook.
  // Email taken / faceImageId used by another user → UniqueConstraintError → 409 via the error handler
  await user.update(changes);
  return getProfile(user.id);
}

export async function getProfile(userId: string) {
  const user = await User.findByPk(userId, { include: [{ association: 'faceImage' }] });
  if (!user) throw HttpError.notFound('User not found');
  return user;
}
