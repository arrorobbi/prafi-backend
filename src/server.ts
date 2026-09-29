import { app } from './app';
import { env } from './config/env';
import { sequelize } from './models';

async function start() {
  try {
    await sequelize.authenticate();
    console.log(`Connected to PostgreSQL database "${env.db.name}"`);
  } catch (err) {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

start();
