/** Creates the initial superadmin account with an active approval (idempotent). Run with `npm run db:seed`. */
import { ROLES } from '../constants/roles';
import { Approval, sequelize, User } from '../models';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'superadmin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('Set SEED_ADMIN_PASSWORD in .env');

  const [user, created] = await User.findOrCreate({
    where: { email },
    defaults: {
      email,
      password,
      firstName: 'Super',
      lastName: 'Admin',
      phoneNumber: '0000000000',
      role: ROLES.SUPERADMIN,
      // Seeded accounts don't go through email verification
      mailActive: true,
    },
  });

  console.log(created ? `Superadmin created: ${user.email}` : `Superadmin already exists: ${user.email}`);
  if (!user.mailActive) await user.update({ mailActive: true });
  console.log('Superadmin email: verified');

  // The auth middleware only lets activated users through, and the superadmin is the one who activates others
  const [approval] = await Approval.findOrCreate({
    where: { userId: user.id, type: 'user' },
    defaults: { userId: user.id, type: 'user', reason: 'Initial superadmin account', isActive: true },
  });
  if (!approval.isActive) await approval.update({ isActive: true });
  console.log(`Superadmin approval: active`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
