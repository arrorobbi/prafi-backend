/**
 * npm run guides:seed [-- <folder of the screenshots>]
 * Loads the default Panduan (db/seeds/guides.json) into guide_sections / guide_steps, only while they are empty
 * (safe to repeat: later runs change nothing). The screenshots are copied from the frontend's public/panduan
 * (or the given folder) into images/, so they can be replaced and deleted in "Kelola Panduan" like any upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sequelize } from '../models';
import { seedDefaults, type SeedSection } from '../services/guide.service';

const ROOT = path.resolve(__dirname, '../..');

async function main() {
  const imagesDir = path.resolve(process.argv[2] ?? path.join(ROOT, '../prafi-frontend/public/panduan'));
  const sections = JSON.parse(fs.readFileSync(path.join(ROOT, 'db/seeds/guides.json'), 'utf8')) as SeedSection[];
  const result = await seedDefaults(sections, imagesDir);
  if (!result) {
    console.log('Panduan: already has content, nothing changed');
    return;
  }
  console.log(`Panduan: ${result.sections} topics, ${result.steps} steps and ${result.images} pictures loaded`);
  for (const file of result.missing) console.warn(`  picture not found (step saved without it): ${file}`);
}

main()
  .catch((err) => {
    console.error('Loading the Panduan failed (nothing was saved):', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
