const studentApproval = require('./studentApproval.controller');
const requirements = require('./requirements.controller');
const teacherBatch = require('./teacherBatch.controller');
const deploymentRequest = require('./deploymentRequest.controller');

module.exports = {
  ...studentApproval,
  ...requirements,
  ...teacherBatch,
  ...deploymentRequest,
};