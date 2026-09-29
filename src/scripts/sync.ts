/**
 * Creates/updates tables from the models.
 *   npm run db:sync            -> create missing tables only
 *   npm run db:sync -- --alter -> alter existing tables to match models
 *   npm run db:sync -- --force -> DROP and recreate all tables (destroys data!)
 */
import { env } from '../config/env';
import { sequelize } from '../models';

async function main() {
  const force = process.argv.includes('--force');
  const alter = process.argv.includes('--alter');

  if (force && env.isProduction) {
    throw new Error('Refusing to run --force in production');
  }

  await sequelize.authenticate();
  await sequelize.sync({ force, alter });
  console.log(`Database synced (${force ? 'force' : alter ? 'alter' : 'create missing'})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
