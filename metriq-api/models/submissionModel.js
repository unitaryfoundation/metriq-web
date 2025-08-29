// submissionModel.js

'use strict'
module.exports = function (sequelize, DataTypes) {
  const Model = sequelize.define('submission', {
    name: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    nameNormal: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    contentUrl: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    thumbnailUrl: {
      type: DataTypes.TEXT
    },
    codeUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    supplementUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    approvedAt: {
      type: DataTypes.DATE
    },
    publishedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    restrictedAppend: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, { paranoid: true })
  Model.associate = function (db) {
    db.user.hasMany(db.submission)
    db.submission.hasMany(db.like)
    db.submission.hasMany(db.submissionSubscription)
    db.submission.hasMany(db.submissionPlatformRef)
    db.submission.hasMany(db.submissionMethodRef)
    db.submission.hasMany(db.submissionTaskRef)
    db.submission.hasMany(db.submissionTagRef)
    db.submission.hasMany(db.moderationReport)
  }
  return Model
}
