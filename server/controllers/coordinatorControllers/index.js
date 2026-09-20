const studentApproval = require('./studentApproval.controller');
const requirements = require('./requirements.controller');
const teacherBatch = require('./teacherBatch.controller');
const deploymentRequest = require('./deploymentRequest.controller');
const dashboard = require('./dashboard.controller');

module.exports = {
  ...studentApproval,
  ...requirements,
  ...teacherBatch,
  ...deploymentRequest,
  ...dashboard,
};