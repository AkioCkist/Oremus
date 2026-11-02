import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { User, USER_ROLES } from '../models/index.js';
import { audit } from '../services/audit.service.js';

/**
 * Staff roles can only start here: the web app has no route that lets someone raise their own role.
 *
 * `grant-role -- <email-or-username> <user|moderator|admin>`
 */
async function main() {
  const [identifier, role] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!identifier || !role || !(USER_ROLES as readonly string[]).includes(role)) {
    console.error(`Usage: grant-role <email-or-username> <${USER_ROLES.join('|')}>`);
    process.exitCode = 1;
    return;
  }
  await connectInfrastructure();
  const key = identifier.toLowerCase();
  const user = await User.findOneAndUpdate({ $or: [{ email: key }, { username: key }], deletedAt: null }, { role }, { new: true });
  if (!user) { console.error(`No user found for ${identifier}.`); process.exitCode = 1; return; }
  await audit('account.role', undefined, 'User', user.id, { to: role, source: 'cli' });
  console.log(`${user.username} is now ${role}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => disconnectInfrastructure());
