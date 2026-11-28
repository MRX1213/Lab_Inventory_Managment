import { query } from '../db/pool.js';
import { hashPassword } from './password.js';

export function allowExistingUserOverwrite(allowRecoveryFlag) {
  return allowRecoveryFlag === '1' || allowRecoveryFlag === 'true';
}

export async function bootstrapAdminUser({
  email,
  firstName,
  lastName,
  password,
  allowRecovery,
}) {
  if (!password || password.length < 8) {
    throw new Error('PASSWORD_TOO_SHORT');
  }
  const role = await query(`SELECT RoleID FROM dbo.Roles WHERE RoleName = N'Admin'`);
  if (!role.recordset.length) {
    throw new Error('NO_ADMIN_ROLE');
  }
  const roleId = role.recordset[0].RoleID;
  const hash = hashPassword(password);
  const existing = await query('SELECT UserID FROM dbo.Users WHERE LOWER(Email)=@email', { email });
  if (existing.recordset.length) {
    if (!allowRecovery) {
      throw new Error('USER_EXISTS');
    }
    await query(
      `UPDATE dbo.Users SET PasswordHash=@hash, IsActive=1, FirstName=@fn, LastName=@ln, RoleID=@rid WHERE UserID=@id`,
      { hash, fn: firstName, ln: lastName, rid: roleId, id: existing.recordset[0].UserID },
    );
    return { action: 'updated', email };
  }
  await query(
    `INSERT INTO dbo.Users (FirstName, LastName, Email, RoleID, PasswordHash, IsActive)
     VALUES (@fn, @ln, @email, @rid, @hash, 1)`,
    { fn: firstName, ln: lastName, email, rid: roleId, hash },
  );
  return { action: 'created', email };
}