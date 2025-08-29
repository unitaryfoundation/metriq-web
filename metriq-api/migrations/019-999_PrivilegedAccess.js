'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'isPrivileged', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false })
    await queryInterface.addColumn('submissions', 'restrictedAppend', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'isPrivileged')
    await queryInterface.removeColumn('submissions', 'restrictedAppend')
  }
}
