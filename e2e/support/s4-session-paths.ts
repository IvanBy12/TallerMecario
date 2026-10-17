import path from 'node:path';
import { AUTH_DIR } from './env';
export const S4_STATE_FILE = path.join(AUTH_DIR, 's4.json');
