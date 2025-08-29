// resultController.js

const { routeWrapper } = require('../util/controllerUtil')

// Service classes
const ResultService = require('../service/resultService')
const SubmissionService = require('../service/submissionService')
const UserService = require('../service/userService')
// Service instance
const resultService = new ResultService()
const submissionService = new SubmissionService()
const userService = new UserService()

// Validate the submission request and create the submission model.
exports.new = async function (req, res) {
  routeWrapper(res,
    async () => {
      const submissionRes = await submissionService.get(req.params.id)
      if (!submissionRes.success || !submissionRes.body) {
        return { success: false, error: 'Submission not found.' }
      }
      const submission = submissionRes.body
      if (submission.restrictedAppend) {
        const userRes = await userService.get(req.auth.id)
        if (!userRes.success || !userRes.body) {
          return { success: false, error: 'User not found.' }
        }
        const user = userRes.body
        if (!user.isPrivileged) {
          return { success: false, error: 'Restricted submission: append not permitted.' }
        }
      }
      return await resultService.submit(req.auth.id, req.params.id, req.body)
    },
    'New result added to submission!', req.auth ? req.auth.id : 0)
}

exports.read = async function (req, res) {
  routeWrapper(res,
    async () => await resultService.getBySubmissionId(req.params.id),
    'Retrieved all results by submission Id.', req.auth ? req.auth.id : 0)
}

exports.update = async function (req, res) {
  routeWrapper(res,
    async () => await resultService.update(req.auth.id, req.params.id, req.body),
    'Updated method.', req.auth ? req.auth.id : 0)
}

exports.delete = async function (req, res) {
  routeWrapper(res,
    async () => await resultService.delete(req.params.id),
    'Successfully deleted result.', req.auth ? req.auth.id : 0)
}

exports.readMetricNames = async function (req, res) {
  routeWrapper(res,
    async () => { return { success: true, body: await resultService.listMetricNames() } },
    'Retrieved all metric names.', req.auth ? req.auth.id : 0)
}
