import { resolve } from 'node:path';
import { adminKey } from './devices.mjs';

const directory = resolve(process.env.FORJA_DATA_DIR ?? 'data/forja');
console.log(adminKey(directory));
