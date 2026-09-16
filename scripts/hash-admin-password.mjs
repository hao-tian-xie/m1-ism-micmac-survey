import { stdin, stdout } from 'node:process';

import { hashAdminPassword } from '../auth/admin-auth-core.mjs';

stdin.setEncoding('utf8');
let password = '';
for await (const chunk of stdin) {
  password += chunk;
  if (password.length > 1025) throw new Error('Password input is too long');
}
password = password.replace(/\r?\n$/u, '');
stdout.write(`${await hashAdminPassword(password)}\n`);
