// userService.js

const { Op } = require('sequelize')

// Data Access Layer
const ModelService = require('./modelService')
// Database Model
const config = require('../config')
const db = require('../models/index')
const sequelize = db.sequelize
const User = db.user

// Password hasher
const bcrypt = require('bcrypt')
const saltRounds = 10
const { v4: uuidv4 } = require('uuid')
const jwt = require('jsonwebtoken')

const recoveryExpirationMinutes = 30
const millisPerMinute = 60000

const nodemailer = require('nodemailer')

class UserService extends ModelService {
  constructor () {
    super(User)
  }

  async sanitize (user) {
    return {
      id: user.id,
      clientToken: '[REDACTED]',
      clientTokenCreated: user.clientTokenCreated,
      email: user.email,
      passwordHash: '[REDACTED]',
      username: user.username,
      usernameNormal: user.usernameNormal,
      affiliation: user.affiliation,
      name: user.name,
      createdAt: user.createdAt,
      isSubscribedToNewSubmissions: user.isSubscribedToNewSubmissions,
      twitterHandle: user.twitterHandle,
      isPrivileged: !!user.isPrivileged
    }
  }

  async generateWebJwt (userId) {
    return await this.generateJwt(userId, 'web', true)
  }

  async generateClientJwt (userId) {
    return await this.generateJwt(userId, 'client', false)
  }

  async generateJwt (userId, role, isExpiring) {
    const meta = { algorithm: config.api.token.algorithm }
    if (isExpiring) {
      meta.expiresIn = config.api.token.expiresIn
    }
    return jwt.sign({ id: userId, role: role }, config.api.token.secretKey, meta)
  }

  async getByUsername (username) {
    return await this.SequelizeServiceInstance.findOne({ usernameNormal: username.trim().toLowerCase() })
  }

  async getByEmail (email) {
    return await this.SequelizeServiceInstance.findOne({ email: email.trim().toLowerCase() })
  }

  async getByUsernameOrEmail (usernameOrEmail) {
    const usernameOrEmailNormal = usernameOrEmail.trim().toLowerCase()
    return await this.SequelizeServiceInstance.findOne({ [Op.or]: [{ usernameNormal: usernameOrEmailNormal }, { email: usernameOrEmailNormal }] })
  }

  async getSubscribedToNewSubmissions () {
    return await this.SequelizeServiceInstance.findAll({ isSubscribedToNewSubmissions: true })
  }

  async get (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User ID not found.' }
    }

    return { success: true, body: user }
  }

  async getSanitized (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User ID not found.' }
    }
    return { success: true, body: await this.sanitize(user) }
  }

  async register (reqBody) {
    const validationResult = await this.validateRegistration(reqBody)
    if (!validationResult.success) {
      return validationResult
    }

    let user = await this.SequelizeServiceInstance.new()
    user.username = reqBody.username.trim()
    user.usernameNormal = reqBody.username.trim().toLowerCase()
    user.affiliation = reqBody.affiliation ? reqBody.affiliation : ''
    user.twitterHandle = reqBody.twitterHandle ? reqBody.twitterHandle : ''
    user.name = reqBody.name ? reqBody.name : ''
    user.email = reqBody.email.trim().toLowerCase()
    user.passwordHash = await bcrypt.hash(reqBody.password, saltRounds)
    user.isSubscribedToNewSubmissions = false

    const result = await this.create(user)
    if (!result.success) {
      return result
    }

    user = result.body
    await user.save()

    return { success: true, body: await this.sanitize(user) }
  }

  async login (reqBody) {
    const user = await this.getByUsernameOrEmail(reqBody.username)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    const isPasswordValid = bcrypt.compareSync(reqBody.password, user.passwordHash)
    if (!isPasswordValid) {
      return { success: false, error: 'Password incorrect.' }
    }

    return { success: true, body: await this.sanitize(user) }
  }

  validateEmail (email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(email)
  }

  validatePassword (password) {
    return password && (password.length >= 12)
  }

  validateTwitterHandle (handle) {
    // https://codepen.io/SitePoint/pen/yLbqeg
    const re = /^@?[A-Za-z0-9_]{1,15}$/
    return re.test(handle)
  }

  async validateRegistration (reqBody) {
    if (!this.validatePassword(reqBody.password)) {
      return { success: false, error: 'Password is too short.' }
    }

    if (reqBody.password !== reqBody.passwordConfirm) {
      return { success: false, error: 'Password and confirmation do not match.' }
    }

    if (!reqBody.username) {
      return { success: false, error: 'Username cannot be blank.' }
    }

    const tlUsername = reqBody.username.trim().toLowerCase()
    if (tlUsername.length === 0) {
      return { success: false, error: 'Username cannot be blank.' }
    }

    if (!reqBody.email) {
      return { success: false, error: 'Email cannot be blank.' }
    }

    const tlEmail = reqBody.email.trim().toLowerCase()

    if (tlEmail.length === 0) {
      return { success: false, error: 'Email cannot be blank.' }
    }

    if (!this.validateEmail(tlEmail)) {
      return { success: false, error: 'Invalid email format.' }
    }

    const username = await this.getByUsername(tlUsername)
    if (username) {
      return { success: false, error: 'Username already in use.' }
    }

    const emailMatch = await this.getByEmail(tlEmail)
    if (emailMatch) {
      return { success: false, error: 'Email already in use.' }
    }

    if (reqBody.twitterHandle && !this.validateTwitterHandle(reqBody.twitterHandle)) {
      return { success: false, error: 'Invalid Twitter handle format.' }
    }

    return { success: true }
  }

  async saveClientTokenForUserId (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    user.clientToken = await this.generateClientJwt(userId)
    user.clientTokenCreated = new Date()
    await user.save()

    return { success: true, body: user.clientToken }
  }

  async deleteClientTokenForUserId (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    user.clientToken = ''
    user.clientTokenCreated = null
    await user.save()

    return { success: true, body: '' }
  }

  async sendRecoveryEmail (usernameOrEmail) {
    if (!config.supportEmail.service) {
      console.log('Skipping email - account info not set.')
      return { success: false, error: 'Support email not available.' }
    }

    let user = await this.getByUsernameOrEmail(usernameOrEmail)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }
    user = await this.getByPk(user.id)
    user.recoveryToken = uuidv4().toString()
    user.recoveryTokenExpiration = new Date((new Date()).getTime() + recoveryExpirationMinutes * millisPerMinute)
    await user.save()

    const transporter = nodemailer.createTransport({
      service: config.supportEmail.service,
      auth: {
        user: config.supportEmail.account,
        pass: config.supportEmail.password
      }
    })

    const mailBody = 'Your password reset link is below: \n\n' + config.web.getUri() + '/Recover/' + encodeURIComponent(user.usernameNormal) + '/' + user.recoveryToken + '\n\n If you did not request a password reset, you can ignore this message.'

    const mailOptions = {
      from: config.supportEmail.address,
      to: user.email,
      subject: 'Password reset request',
      text: mailBody
    }

    const emailResult = await transporter.sendMail(mailOptions)
    if (emailResult.accepted && (emailResult.accepted[0] === user.email)) {
      await user.save()
      return { success: true, body: user.recoveryToken }
    } else {
      return { success: false, message: 'Could not send email.' }
    }
  }

  async tryPasswordRecoveryChange (reqBody) {
    if (!this.validatePassword(reqBody.password)) {
      return { success: false, error: 'Password is too short.' }
    }

    if (reqBody.password !== reqBody.passwordConfirm) {
      return { success: false, error: 'Password and confirmation do not match.' }
    }

    let user = await this.getByUsernameOrEmail(reqBody.username)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }
    user = await this.getByPk(user.id)

    if (!user.recoveryToken || (user.recoveryToken !== reqBody.uuid.toString()) || (user.recoveryTokenExpiration < new Date())) {
      return { success: false, error: 'Supplied bad recovery token.' }
    }

    user.passwordHash = await bcrypt.hash(reqBody.password, saltRounds)
    user.recoveryToken = null
    user.recoveryTokenExpiration = null
    await user.save()

    return { success: true, body: await this.getSanitized(user.id) }
  }

  async update (userId, reqBody) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    if (reqBody.name !== undefined) {
      user.name = reqBody.name
    }
    if (reqBody.email !== undefined) {
      user.email = reqBody.email
    }
    if (reqBody.affiliation !== undefined) {
      user.affiliation = reqBody.affiliation
    }
    if (reqBody.twitterHandle !== undefined) {
      user.twitterHandle = reqBody.twitterHandle
    }

    await user.save()
    return await this.getSanitized(user.id)
  }

  async tryPasswordChange (userId, reqBody) {
    if (!this.validatePassword(reqBody.password)) {
      return { success: false, error: 'Password is too short.' }
    }

    if (reqBody.password !== reqBody.passwordConfirm) {
      return { success: false, error: 'Password and confirmation do not match.' }
    }

    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    const isPasswordValid = bcrypt.compareSync(reqBody.oldPassword, user.passwordHash)
    if (!isPasswordValid) {
      return { success: false, error: 'Password incorrect.' }
    }

    user.passwordHash = await bcrypt.hash(reqBody.password, saltRounds)
    user.recoveryToken = null
    user.recoveryTokenExpiration = null
    await user.save()

    return { success: true, body: await this.getSanitized(user.id) }
  }

  async delete (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    await user.destroy()

    return { success: true, body: user }
  }

  async unsubscribe (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    const submissions = await user.getSubmissionSubscriptions()
    for (let i = 0; i < submissions.length; ++i) {
      await submissions[i].destroy()
    }
    const tasks = await user.getTaskSubscriptions()
    for (let i = 0; i < tasks.length; ++i) {
      await tasks[i].destroy()
    }
    const methods = await user.getMethodSubscriptions()
    for (let i = 0; i < methods.length; ++i) {
      await methods[i].destroy()
    }
    const platforms = await user.getPlatformSubscriptions()
    for (let i = 0; i < platforms.length; ++i) {
      await platforms[i].destroy()
    }

    return { success: true, body: user }
  }

  async getFollowedTasks (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    const subscriptions = await user.getTaskSubscriptions()
    const tasks = []
    for (let i = 0; i < subscriptions.length; ++i) {
      const task = await subscriptions[i].getTask()
      if (task) {
        tasks.push(task)
      }
    }

    return { success: true, body: tasks }
  }

  async setNewSubmissionSubscription (userId, isSubscribed) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    user.isSubscribedToNewSubmissions = isSubscribed
    await user.save()

    return { success: true, body: user }
  }

  async getTopSubmitters (count) {
    const month = new Date()
    month.setDate(month.getDate() - 30)

    const week = new Date()
    week.setDate(week.getDate() - 7)

    const pad = function (num) { return ('00' + num).slice(-2) }

    return {
      success: true,
      body: {
        allTime: (await sequelize.query(
          'SELECT users.id, users.username, COUNT(submissions."userId") AS "submissionsCount" FROM users' +
          ' LEFT JOIN submissions ON users.id = submissions."userId" AND submissions."publishedAt" IS NOT NULL' +
          ' GROUP BY users.id' +
          ' ORDER BY "submissionsCount" DESC' +
          ' LIMIT ' + count))[0],
        monthly: (await sequelize.query(
          'SELECT users.id, users.username, COUNT(submissions."userId") AS "submissionsCount" FROM users' +
          ' LEFT JOIN submissions ON users.id = submissions."userId" AND submissions."publishedAt" > \'' + month.getUTCFullYear() + '-' + pad(month.getUTCMonth() + 1) + '-' + pad(month.getUTCDate()) + '\'' +
          ' GROUP BY users.id' +
          ' ORDER BY "submissionsCount" DESC' +
          ' LIMIT ' + count))[0],
        weekly: (await sequelize.query(
          'SELECT users.id, users.username, COUNT(submissions."userId") AS "submissionsCount" FROM users' +
          ' LEFT JOIN submissions ON users.id = submissions."userId" AND submissions."publishedAt" > \'' + week.getUTCFullYear() + '-' + pad(week.getUTCMonth() + 1) + '-' + pad(week.getUTCDate()) + '\'' +
          ' GROUP BY users.id' +
          ' ORDER BY "submissionsCount" DESC' +
          ' LIMIT ' + count))[0]
      }
    }
  }

  async getPublicProfile (userId) {
    const user = await this.getByPk(userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    const taskSubs = await user.getTaskSubscriptions({
      include: [{ model: db.task, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: 5
    })
    const recentTaskSubs = taskSubs.map(sub => ({
      id: sub.task.id,
      name: sub.task.name
    }))

    const recentUpvotes = await sequelize.query(
      'SELECT s.id, s.name FROM likes l ' +
      'JOIN submissions s ON l."submissionId" = s.id ' +
      'WHERE l."userId" = $userId ' +
      'ORDER BY l."createdAt" DESC LIMIT 5',
      { bind: { userId }, type: sequelize.QueryTypes.SELECT }
    )

    return {
      success: true,
      body: {
        username: user.username,
        affiliation: user.affiliation,
        twitterHandle: user.twitterHandle,
        createdAt: user.createdAt,
        recentTaskSubs: recentTaskSubs,
        recentUpvotes: recentUpvotes
      }
    }
  }
}

module.exports = UserService
