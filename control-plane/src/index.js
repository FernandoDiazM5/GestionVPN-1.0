'use strict';

module.exports = {
  ...require('./domain/subdomains'),
  ...require('./domain/activationCodes'),
  ...require('./domain/licenses'),
  ...require('./domain/instanceRequests'),
  ...require('./services/consumeActivation'),
  ...require('./services/issueLicense'),
  ...require('./services/activationRateLimit'),
  ...require('./services/activateInstance'),
};
