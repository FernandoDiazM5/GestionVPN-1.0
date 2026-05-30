export function validateIP(ip: string): boolean {
  if (!ip) return false;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return ipRegex.test(ip);
}

export function validateCredentials(user: string, pass: string): boolean {
  return user.length > 0 && pass.length > 0;
}

export function validateSettingsForm(mtIp: string, mtUser: string, mtPass: string): boolean {
  return validateIP(mtIp) && validateCredentials(mtUser, mtPass);
}
