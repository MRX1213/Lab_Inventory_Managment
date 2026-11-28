import { getPool } from '../src/db/pool.js';
import { allowExistingUserOverwrite, bootstrapAdminUser } from '../src/lib/bootstrapAdmin.js';
import { readPasswordMasked } from '../src/lib/readPasswordMasked.js';

async function readPassword() {
  if (process.env.LAB_ADMIN_PASSWORD) return process.env.LAB_ADMIN_PASSWORD;
  return readPasswordMasked('Admin password (min 8 chars): ');
}

const email = (process.env.LAB_ADMIN_EMAIL || 'admin@lab.example').trim().toLowerCase();
const firstName = process.env.LAB_ADMIN_FIRST || 'Lab';
const lastName = process.env.LAB_ADMIN_LAST || 'Admin';
const allowRecovery = allowExistingUserOverwrite(process.env.LAB_ADMIN_RECOVERY);
const password = await readPassword();

await getPool();
try {
  const result = await bootstrapAdminUser({
    email,
    firstName,
    lastName,
    password,
    allowRecovery,
  });
  if (result.action === 'updated') {
    console.log(`Updated admin password for ${email} (recovery mode)`);
  } else {
    console.log(`Created admin ${email}`);
  }
} catch (err) {
  if (err.message === 'PASSWORD_TOO_SHORT') {
    console.error('Password must be at least 8 characters.');
  } else if (err.message === 'NO_ADMIN_ROLE') {
    console.error('Run Database/LabInventory_Init.sql first.');
  } else if (err.message === 'USER_EXISTS') {
    console.error(
      `Account ${email} already exists. Set LAB_ADMIN_RECOVERY=1 to reset password in recovery mode.`,
    );
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
}
process.exit(0);