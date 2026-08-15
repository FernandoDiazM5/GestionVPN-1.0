'use strict';

module.exports = {
  ...require('./domain/subdomains'),
  ...require('./domain/activationCodes'),
  ...require('./domain/licenses'),
  ...require('./services/consumeActivation'),
  ...require('./services/issueLicense'),
  ...require('./services/activationRateLimit'),
};
