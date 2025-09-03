import axios from 'axios'
import React, { Suspense } from 'react'
import config from './../config'
import ErrorHandler from './../components/ErrorHandler'
import FormFieldRow from '../components/FormFieldRow'
import FormFieldWideRow from '../components/FormFieldWideRow'
import FormFieldSelectRow from '../components/FormFieldSelectRow'
import { Button, Modal, Tab, Tabs } from 'react-bootstrap'
import { useParams, Link } from 'react-router-dom'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faEdit } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import CategoryScroll from '../components/CategoryScroll'
import { Parser } from '@json2csv/plainjs'
import Commento from '../components/Commento'
import SocialShareIcons from '../components/SocialShareIcons'
import SubscribeButton from '../components/SubscribeButton'
import SortingTable from '../components/SortingTable'
import { sortByCounts } from '../components/SortFunctions'
import { renderLatex } from '../components/RenderLatex'
import TopSubmitters from '../components/TopSubmitters'
import SubmissionScroll from '../components/SubmissionScroll'
const QuantumVolumeChart = React.lazy(() => import('../components/QuantumVolumeChart'))

library.add(faEdit)

function withParams (Component) {
  return props => <Component {...props} params={useParams()} />
}

class Task extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      taskId: this.props.params.id,
      requestFailedMessage: '',
      showEditModal: false,
      task: { name: '', fullName: '', description: '', parentTask: 0 },
      item: { submissions: [], childTasks: [], parentTask: {} },
      allTaskNames: [],
      results: [],
      resultsJson: [],
      isLowerBetterDict: {}
    }

    this.fetchData = this.fetchData.bind(this)
    this.handleShowEditModal = this.handleShowEditModal.bind(this)
    this.handleHideEditModal = this.handleHideEditModal.bind(this)
    this.handleEditModalDone = this.handleEditModalDone.bind(this)
    this.handleOnChange = this.handleOnChange.bind(this)
    this.handleTrimTasks = this.handleTrimTasks.bind(this)
    this.handleCsvExport = this.handleCsvExport.bind(this)
    this.handleOnLoadData = this.handleOnLoadData.bind(this)
    this.handleLoginRedirect = this.handleLoginRedirect.bind(this)
  }

  handleLoginRedirect () {
    this.props.history.push('/Login/' + encodeURIComponent('Task/' + this.props.match.params.id))
  }

  handleShowEditModal () {
    let mode = 'Edit'
    if (!this.props.isLoggedIn) {
      mode = 'Login'
    }
    const task = {
      name: this.state.item.name,
      fullName: this.state.item.fullName,
      description: this.state.item.description,
      parentTask: this.state.item.parentTask
        ? { id: this.state.item.parentTask.id, name: this.state.item.parentTask.name }
        : { id: 0, name: '(None)' }
    }
    this.setState({ showEditModal: true, modalMode: mode, task })
  }

  handleHideEditModal () {
    this.setState({ showEditModal: false })
  }

  handleEditModalDone () {
    if (!this.props.isLoggedIn) {
      this.handleLoginRedirect()
    }

    const reqBody = {
      name: this.state.task.name,
      fullName: this.state.task.fullName,
      description: this.state.task.description,
      parentTask: this.state.task.parentTask
    }

    axios.post(config.api.getUriPrefix() + '/task/' + this.props.match.params.id, reqBody)
      .then(res => {
        this.setState({ item: res.data.data, showEditModal: false })
      })
      .catch(err => {
        window.alert('Error: ' + ErrorHandler(err) + '\nSorry! Check your connection and login status, and try again.')
      })
  }

  handleOnChange (key1, key2, value) {
    if (!value && value !== false) {
      value = null
    }
    if (key1) {
      const k1 = this.state[key1]
      k1[key2] = value
      this.setState({ [key1]: k1 })
    } else {
      this.setState({ [key2]: value })
    }
  }

  handleTrimTasks (taskId, tasks) {
    for (let j = 0; j < tasks.length; j++) {
      if (taskId === tasks[j].id) {
        tasks.splice(j, 1)
        break
      }
    }
    tasks.sort(function (a, b) {
      if (a.name.toLowerCase() < b.name.toLowerCase()) return -1
      if (a.name.toLowerCase() > b.name.toLowerCase()) return 1
      return 0
    })
  }

  fetchData (id) {
    window.scrollTo(0, 0)

    const taskRoute = config.api.getUriPrefix() + '/task/' + id
    axios.get(taskRoute)
      .then(res => {
        const task = res.data.data
        task.childTasks.sort(sortByCounts)
        this.setState({ requestFailedMessage: '', item: task })

        const taskNamesRoute = config.api.getUriPrefix() + '/task/names'
        axios.get(taskNamesRoute)
          .then(res => {
            const tasks = [...res.data.data]
            this.handleTrimTasks(task.id, tasks)
            this.setState({ requestFailedMessage: '', allTaskNames: tasks })
          })
          .catch(err => {
            this.setState({ requestFailedMessage: ErrorHandler(err) })
          })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })
  }

  componentDidMount () {
    const { id } = this.props.params
    this.setState({ taskId: id })
    this.fetchData(id)
  }

  componentDidUpdate (prevProps) {
    const { id } = this.props.params
    if (this.state.taskId !== id) {
      this.setState({ taskId: id })
      this.fetchData(id)
    }
  }

  handleOnLoadData (task) {
    const results = task.results
    const resultsJson = results.map(row => {
      const submission = task.submissions.find(e => e.name === row.submissionName)
      return {
        key: row.id,
        name: row.submissionName,
        submissionId: submission ? submission.id : 0,
        platformName: row.platformName,
        methodName: row.methodName,
        metricName: row.metricName,
        metricValue: row.metricValue,
        qubitCount: row.qubitCount,
        circuitDepth: row.circuitDepth,
        tableDate: row.evaluatedAt ? new Date(row.evaluatedAt).toLocaleDateString() : new Date(row.createdAt).toLocaleDateString()
      }
    })
    this.setState({ requestFailedMessage: '', item: task, results, resultsJson })
  }

  handleCsvExport () {
    const fields = Object.keys(this.state.resultsJson[0])
    const opts = { fields }
    const parser = new Parser(opts)
    const csv = parser.parse(this.state.resultsJson)

    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv))
    element.setAttribute('download', this.state.item.name)

    element.style.display = 'none'
    document.body.appendChild(element)

    element.click()

    document.body.removeChild(element)
  }

  render () {
    return (
      <div id='metriq-main-content'>
        <div className='submission-detail-container'>
          <div className='row'>
            <div className='col-xl-9 col-12'>
              <h1 className='view-header'>{this.state.item.fullName ? this.state.item.fullName : this.state.item.name}</h1> <FontAwesomeIcon icon='edit' className='submission-edit' onClick={this.handleShowEditModal} />
              <div className='float-end'>
                <SubscribeButton item={this.state.item} type='task' isLoggedIn={this.props.isLoggedIn} />
                <SocialShareIcons url={config.web.getUriPrefix() + '/task/' + this.props.match.params.id} />
              </div>
            </div>
          </div>
          <br />
          {this.state.item.parentTask &&
            <span>
              <div className='row'>
                <div className='col-12'>
                  <div className='submission-description'>
                    <b>Parent task</b>&nbsp;&nbsp;&nbsp;&nbsp;<Link to={'/Task/' + this.state.item.parentTask.id}>{this.state.item.parentTask.name}</Link>
                  </div>
                </div>
              </div>
              <br />
            </span>}
          {!this.state.item.isHideChart &&
            <Suspense fallback={<div>Loading...</div>}>
              <QuantumVolumeChart
                chartId='task-detail'
                xLabel='Time'
                taskId={this.props.match.params.id}
                onLoadData={this.handleOnLoadData}
                logBase='2'
                onCsvExport={this.handleCsvExport}
              />
            </Suspense>}
          <br />
          <div className='row'>
            <div className='col-xl-9 col-12'>
              <div className='submission-description'>
                {this.state.item.description ? renderLatex(this.state.item.description) : <i>No description provided.</i>}
              </div>
            </div>
          </div>
          <br />
          {(this.state.item.childTasks && (this.state.item.childTasks.length > 0)) &&
            <div>
              <h2>Child Tasks</h2>
              <CategoryScroll type='task' items={this.state.item.childTasks} isLoggedIn={this.props.isLoggedIn} />
              <br />
            </div>}
          <h2>Results</h2>
          <div className='row'>
            <div className='col-md-9'>
              {(this.state.results.length > 0) &&
                <div>
                  <SortingTable
                    className='detail-table'
                    columns={[{
                      title: 'Submission',
                      key: 'name',
                      width: 250
                    },
                    {
                      title: 'Method',
                      key: 'methodName',
                      width: 250
                    },
                    {
                      title: 'Platform',
                      key: 'platformName',
                      width: 250
                    },
                    {
                      title: 'Date',
                      key: 'tableDate',
                      width: 250
                    },
                    {
                      title: 'Metric',
                      key: 'metricName',
                      width: 250
                    },
                    {
                      title: 'Value',
                      key: 'metricValue',
                      width: 250
                    }]}
                    data={this.state.resultsJson}
                    onRowClick={(record) => this.props.history.push('/Submission/' + record.submissionId)}
                    tableLayout='auto'
                    rowClassName='link'
                    isCollapsible
                    collapseLabelNoun='results'
                  />
                </div>}
              <br />
              {(this.state.item.submissions.length > 0) &&
                <div>
                  <h2>Submissions</h2>
                  <SortingTable
                    className='detail-table'
                    columns={[{
                      title: 'Name',
                      key: 'name',
                      width: 700
                    },
                    {
                      title: 'Submitted',
                      key: 'createdAt',
                      width: 200
                    },
                    {
                      title: 'Up-votes',
                      key: 'upvoteCount',
                      width: 200
                    }]}
                    data={this.state.item.submissions.map(row => ({
                      key: row.id,
                      name: row.name,
                      createdAt: new Date(row.createdAt).toLocaleDateString('en-US'),
                      upvoteCount: row.upvoteCount || 0
                    }))}
                    onRowClick={(record) => this.props.history.push('/Submission/' + record.key)}
                    tableLayout='auto'
                    rowClassName='link'
                    isCollapsible
                    collapseLabelNoun='submissions'
                  />
                </div>}
            </div>
            <br />
            <div className='col-md-3'>
              <div className='card top-submitters-card'>
                <TopSubmitters isOnlyAllTime />
              </div>
              <br />
              <div className='card top-submitters-card'>
                <h5>Top Submissions</h5>
                <Tabs id='top-submissions-tabs' activeKey={this.state.activeTab} onSelect={activeTab => this.setState({ activeTab })}>
                  <Tab eventKey='Trending' title='Trending' className='metriq-nav-tab'>
                    <SubmissionScroll isSmall sortType='trending' isLoggedIn={this.props.isLoggedIn} />
                  </Tab>
                  <Tab eventKey='Popular' title='Popular' className='metriq-nav-tab'>
                    <SubmissionScroll isSmall sortType='popular' isLoggedIn={this.props.isLoggedIn} />
                  </Tab>
                  <Tab eventKey='Latest' title='Latest' className='metriq-nav-tab'>
                    <SubmissionScroll isSmall sortType='latest' isLoggedIn={this.props.isLoggedIn} />
                  </Tab>
                </Tabs>
              </div>
            </div>
          </div>
          <br />
          <FormFieldWideRow>
            <h4 align='left'>Comments</h4>
            <Commento id={'task-' + toString(this.state.item.id)} />
          </FormFieldWideRow>
        </div>
        <Modal
          show={this.state.showEditModal}
          onHide={this.handleHideEditModal}
          size='lg'
          aria-labelledby='contained-modal-title-vcenter'
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Edit Task</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {(this.state.modalMode === 'Login') &&
              <span>
                Please <Link to={'/Login/' + encodeURIComponent('Task/' + this.props.match.params.id)}>login</Link> before editing.
              </span>}
            {(this.state.modalMode !== 'Login') &&
              <span>
                <FormFieldRow
                  inputName='name' inputType='text' label='Name'
                  value={this.state.task.name}
                  onChange={(field, value) => this.handleOnChange('task', field, value)}
                  disabled={!this.state.item.parentTask}
                /><br />
                <FormFieldRow
                  inputName='fullName' inputType='text' label='Full Name'
                  value={this.state.task.fullName}
                  onChange={(field, value) => this.handleOnChange('task', field, value)}
                  disabled={!this.state.item.parentTask}
                /><br />
                <FormFieldSelectRow
                  inputName='parentTask'
                  label='Parent task'
                  options={this.state.allTaskNames}
                  value={this.state.task.parentTask.id}
                  onChange={(field, value) => this.handleOnChange('task', field, value)}
                  tooltip='The new task is a sub-task of a "parent" task.'
                  disabled={!this.state.item.parentTask}
                /><br />
                <FormFieldRow
                  inputName='description' inputType='textarea' label='Description' rows='12'
                  value={this.state.task.description}
                  onChange={(field, value) => this.handleOnChange('task', field, value)}
                />
              </span>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant='primary' onClick={this.handleEditModalDone}>
              {(this.state.modalMode === 'Login') ? 'Cancel' : 'Done'}
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    )
  }
}

export default withParams(Task)
