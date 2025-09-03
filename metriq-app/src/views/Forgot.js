import axios from 'axios'
import React from 'react'
import config from './../config'
import FormFieldRow from '../components/FormFieldRow'
import FormFieldValidator from '../components/FormFieldValidator'
import ErrorHandler from '../components/ErrorHandler'
import FormFieldAlertRow from '../components/FormFieldAlertRow'
import FormFieldWideRow from '../components/FormFieldWideRow'
import ViewHeader from '../components/ViewHeader'
import { usernameValidRegex } from '../components/ValidationRegex'

const usernameMissingError = 'Username cannot be blank.'

class Forgot extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      user: '',
      isRequestReceived: false,
      requestFailedMessage: ''
    }

    this.handleOnChange = this.handleOnChange.bind(this)
    this.isAllValid = this.isAllValid.bind(this)
    this.handleOnSubmit = this.handleOnSubmit.bind(this)
  }

  handleOnChange (field, value) {
    // parent class change handler is always called with field name and value
    this.setState({ [field]: value })
  }

  isAllValid () {
    if (!usernameValidRegex.test(this.state.username)) {
      return false
    }

    return true
  }

  handleOnSubmit (event) {
    if (!this.isAllValid()) {
      event.preventDefault()
      return
    }

    const request = {
      user: this.state.user
    }

    axios.post(config.api.getUriPrefix() + '/recover', request)
      .then(res => {
        this.setState({ requestFailedMessage: '', isRequestReceived: true })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })
    event.preventDefault()
  }

  render () {
    if (this.state.isRequestReceived) {
      return (
        <div id='metriq-main-content' className='container'>
          <ViewHeader>Account Recovery</ViewHeader>
          <br />
          <FormFieldAlertRow>
            Your request has been received. If that account username or email exists, you will receive an email with further account recovery instructions. (Check your email inbox.)<br />
          </FormFieldAlertRow>
        </div>
      )
    }
    return (
      <div id='metriq-main-content' className='container'>
        <ViewHeader>Account Recovery</ViewHeader>
        <form onSubmit={this.handleOnSubmit}>
          <FormFieldAlertRow>
            <b>You can log in with either your username or email for your account, with your password.</b><br />
          </FormFieldAlertRow>
          <FormFieldAlertRow>
            <b>If you have forgotten your password,</b> enter either your username or account email below, and we will send a password recovery link to the associated account email, if it exists.<br />
          </FormFieldAlertRow>
          <FormFieldRow
            inputName='user' inputType='text' label='Username/Email'
            validatorMessage={usernameMissingError}
            onChange={this.handleOnChange}
            validRegex={usernameValidRegex}
          />
          <FormFieldAlertRow>
            <FormFieldValidator invalid={!!this.state.requestFailedMessage} message={this.state.requestFailedMessage} />
          </FormFieldAlertRow>
          <FormFieldWideRow className='text-center'>
            <input className='btn btn-primary' type='submit' value='Submit' />
          </FormFieldWideRow>
        </form>
      </div>
    )
  }
}

export default Forgot
