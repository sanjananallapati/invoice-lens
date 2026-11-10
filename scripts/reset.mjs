import 'dotenv/config';
import fs from 'node:fs';import path from 'node:path';
if(!process.argv.includes('--confirm')){console.error('Stop the server first. Run npm run reset -- --confirm to archive demo data and start fresh.');process.exit(1);}
const dir=path.resolve(process.env.DATA_DIR||'data');
if(fs.existsSync(dir)){const backup=dir+'-backup-'+Date.now();fs.renameSync(dir,backup);console.log('Previous demo data archived at '+backup);}else console.log('No demo data to reset.');
console.log('Restart the server to seed a fresh database.');
