// scripts/build-zip.js: packages dist/ for upload.

export const buildZip = `import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

// Zips dist/ into <id>-<version>.zip, ready to upload on the Developer page.
// Runs last in "npm run build", after the config has been validated and stamped.
const distPath = path.resolve('dist');
const configPath = path.join(distPath, 'game.config.json');

if (!fs.existsSync(configPath)) {
  console.error('dist/game.config.json is missing. Run "npm run build" instead of this script directly.');
  process.exit(1);
}

const { id, version } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const zipName = id + '-' + version + '.zip';

const zip = new AdmZip();
zip.addLocalFolder(distPath);
zip.writeZip(zipName);

console.log('✅ Created ' + zipName + '. Upload it on the Developer page at https://boardgames.dallinking.com');
`;
