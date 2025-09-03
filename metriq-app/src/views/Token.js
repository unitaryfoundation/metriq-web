import axios from 'axios'
import React from 'react'
import { Button } from 'react-bootstrap'
import config from './../config'
import FormFieldValidator from '../components/FormFieldValidator'
import ErrorHandler from '../components/ErrorHandler'
import FormFieldAlertRow from '../components/FormFieldAlertRow'
import FormFieldWideRow from '../components/FormFieldWideRow'
import ViewHeader from '../components/ViewHeader'

const isActiveTokenPrefix = 'You have an active API token, created '
const isNoTokenMessage = 'You do not have an active token.'

class Token extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      data: {},
      requestFailedMessage: '',
      isGeneratedSuccess: false,
      token: ''
    }

    this.handleGenerateOnClick = this.handleGenerateOnClick.bind(this)
    this.handleDeleteOnClick = this.handleDeleteOnClick.bind(this)
  }

  componentDidMount () {
    axios.get(config.api.getUriPrefix() + '/user')
      .then(res => {
        this.setState({
          data: res.data.data,
          requestFailedMessage: ''
        })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })
  }

  handleGenerateOnClick () {
    axios.post(config.api.getUriPrefix() + '/token', {})
      .then(res => {
        this.setState({
          token: res.data.data,
          requestFailedMessage: '',
          isGeneratedSuccess: true
        })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })
  }

  handleDeleteOnClick () {
    axios.delete(config.api.getUriPrefix() + '/token')
      .then(res => {
        this.setState({
          data: {},
          token: '',
          requestFailedMessage: 'Token successfully deleted.',
          isGeneratedSuccess: false
        })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })
  }

  render () {
    if (this.state.isGeneratedSuccess) {
      return (
        <div id='metriq-main-content' className='container'>
          <ViewHeader>Get Token</ViewHeader>
          <br />
          <div>
            <FormFieldWideRow>This is your new token:</FormFieldWideRow>
            <br />
            <FormFieldAlertRow className='break-all'>{this.state.token}</FormFieldAlertRow>
            <br />
            <FormFieldWideRow> You <b>cannot</b> retrieve it here again.<br />Save it in a secure place.</FormFieldWideRow>
          </div>
        </div>
      )
    }
    return (
      <div id='metriq-main-content' className='container'>
        <ViewHeader>Get Token</ViewHeader>
        <br />
        <div>
          <FormFieldWideRow>
            <b>{this.state.data.clientTokenCreated ? isActiveTokenPrefix + this.state.data.clientTokenCreated + '.' : isNoTokenMessage}</b>
          </FormFieldWideRow>
          <br />
          <FormFieldWideRow>
            Generating a new token will invalidate <b>all</b> previous tokens.<br />When you generate a new token, it will be displayed to you <b>once</b>.<br />Save it securely for your records. This is your token for client software access.<br />
          </FormFieldWideRow>
          <br />
          <FormFieldWideRow>
            <b>Are you sure you want to generate a new token?<br />All previous tokens will be invalidated.</b>
          </FormFieldWideRow>
          <br />
          <FormFieldWideRow className='text-center'>
            <Button variant='primary' onClick={this.handleGenerateOnClick}>Generate new API Token</Button>
          </FormFieldWideRow>
          <br />
          <FormFieldWideRow className='text-center'>
            <Button variant='primary' onClick={this.handleDeleteOnClick}>Disable API access</Button>
          </FormFieldWideRow>
          <br />
          <FormFieldAlertRow>
            <FormFieldValidator invalid={!!this.state.requestFailedMessage} message={this.state.requestFailedMessage} />
          </FormFieldAlertRow>
        </div>
      </div>
    )
  }
}

export default Token
