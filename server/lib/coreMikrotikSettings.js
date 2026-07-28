const { getAppSetting, decryptPass } = require('../db.service');

async function loadCoreMikrotik() {
  try {
    const [ip, user, passEnc] = await Promise.all([
      getAppSetting('MT_IP'),
      getAppSetting('MT_USER'),
      getAppSetting('MT_PASS'),
    ]);
    return (ip && user && passEnc)
      ? { ip, user, pass: decryptPass(passEnc) }
      : null;
  } catch (_) {
    return null;
  }
}

module.exports = { loadCoreMikrotik };
