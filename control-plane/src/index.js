'use strict';

module.exports = {
  ...require('./domain/subdomains'),
  ...require('./domain/activationCodes'),
  ...require('./services/consumeActivation'),
};
