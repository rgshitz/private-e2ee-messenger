import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(configDir, '../..');
const projectRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env'), override: true });
