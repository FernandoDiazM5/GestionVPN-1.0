export function validateUsername(username: string): boolean {
  return username.length > 0 && username.length <= 100;
}

export function validatePassword(password: string, isEdit: boolean): boolean {
  if (isEdit) return true;
  return password.length >= 6;
}

export function validateRole(role: string): boolean {
  return ['admin', 'operator', 'viewer'].includes(role);
}

export function validateUserForm(username: string, password: string, isEdit: boolean): boolean {
  return validateUsername(username) && validatePassword(password, isEdit) && validateRole(password);
}
