import axios from 'axios'
import React from 'react'
import { sortCommon, sortAlphabetical } from '../components/SortFunctions'
import { withRouter, Link } from 'react-router-dom'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faHeart, faExternalLinkAlt, faChartLine } from '@fortawesome/free-solid-svg-icons'
import config from '../config'
import ErrorHandler from '../components/ErrorHandler'
import FormFieldValidator from '../components/FormFieldValidator'
import FormFieldAlertRow from '../components/FormFieldAlertRow'
import QuantumVolumeChart from '../components/QuantumVolumeChart'
import AggregatedMetricsTable from '../components/AggregatedMetricsTable'

library.add(faHeart, faExternalLinkAlt, faChartLine)

const METRIQ_GYM_SUBMISSION_ID = 800

class Trends extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      isLoading: true,
      results: [],
      alphabetical: [],
      allNames: [],
      platforms: [],
      featured: [34, 38, 159],
      trending: [],
      popular: [],
      latest: [],
      topSubmitters: [],
      activeTab: 'Trending',
      filterId: null,
      requestFailedMessage: '',
      isLinkBlocked: false
    }

    this.handleOnFilter = this.handleOnFilter.bind(this)
    this.handleOnSelect = this.handleOnSelect.bind(this)
  }

  handleOnFilter (value) {
    if (value) {
      this.setState({ filterId: value.id })
    }
  }

  handleOnSelect (value) {
    if (value) {
      this.props.history.push('/Task/' + value.id)
    }
  }

  componentDidMount () {
    axios.get(`${config.api.getUriPrefix()}/submission/${METRIQ_GYM_SUBMISSION_ID}/results`)
      .then(async res => {
        const results = res.data.data || []
        const platformIds = [...new Set(results.map(r => r.platformId).filter(Boolean))]
        const platformResponses = await Promise.all(
          platformIds.map(id =>
            axios.get(`${config.api.getUriPrefix()}/platform/${id}`)
              .then(res => ({ id, data: res.data.data }))
              .catch(() => ({ id, data: null }))
          )
        )
        const platformMap = {}
        platformResponses.forEach(({ id, data }) => {
          platformMap[id] = data
        })
        const enrichedResults = results.map(r => ({
          ...r,
          platform: platformMap[r.platformId] || {}
        }))
        this.setState({ results: enrichedResults, isLoading: false })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err), isLoading: false })
      })

    axios.get(config.api.getUriPrefix() + '/task/submissionCount')
      .then(res => {
        const alphabetical = res.data.data
        alphabetical.sort(sortAlphabetical)
        this.setState({ alphabetical, isLoading: false })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })

    axios.get(config.api.getUriPrefix() + '/task/names')
      .then(res => {
        this.setState({
          requestFailedMessage: '',
          allNames: res.data.data
        })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })

    axios.get(config.api.getUriPrefix() + '/platform/submissionCount')
      .then(res => {
        const common = [...res.data.data]
        common.sort(sortCommon)
        const rws = []
        for (let i = 0; i < 2; ++i) {
          const row = []
          for (let j = 0; j < 3; ++j) {
            row.push(common[3 * i + j])
          }
          rws.push(row)
        }
        this.setState({
          requestFailedMessage: '',
          platforms: rws
        })
      })
      .catch(err => {
        this.setState({ requestFailedMessage: ErrorHandler(err) })
      })
  }

  render () {
    return (
      <span>
        <div className='metriq-header'>
          <h1><b>Community-driven</b> quantum benchmarks</h1>
          <p><a href='/Submissions'>Submissions</a> show performance of <a href='/Methods/'>methods</a> on <a href='/Platforms/'>platforms</a> against <a href='/Tasks/'>tasks</a></p>
          <br />
        </div>
        <div id='metriq-main-content'>
          <br />
          <div className='row'>
            <div className='col'>
              <h4 align='left'>Featured Tasks</h4>
              <p className='text-start'>We have highlighted tasks here and you can <Link to='/Tasks'>search for more</Link>:</p>
            </div>
          </div>
          <div className='row'>
            <div className='col-md-12'>
              {this.state.featured.map((taskId, index) =>
                <span key={index}>
                  <QuantumVolumeChart
                    chartId={index}
                    taskId={taskId}
                    metric={taskId === 34 ? 'Quantum volume' : (taskId === 38 ? 'Infidelity' : 'Qubits')}
                    isLog={index < 2}
                    logBase={(index === 0) ? '2' : '10'}
                    isHideSubset
                    isPreview
                  />
                  <br />
                </span>
              )}
            </div>
          </div>
          <div className='row'>
            <div className='col'>
              <h4 align='left'><a href={`/submission/${METRIQ_GYM_SUBMISSION_ID}`}>Metriq-gym results</a></h4>
              <br />
              <AggregatedMetricsTable results={this.state.results} />
            </div>
          </div>
          <br />
          <FormFieldAlertRow>
            <FormFieldValidator invalid={!!this.state.requestFailedMessage} message={this.state.requestFailedMessage} />
          </FormFieldAlertRow>
        </div>
      </span>
    )
  }
}

export default withRouter(Trends)
