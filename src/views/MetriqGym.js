import axios from 'axios'
import React from 'react'
import config from '../config'
import { withRouter } from 'react-router-dom'
import ErrorHandler from '../components/ErrorHandler'

import AggregatedMetricsTable from '../components/AggregatedMetricsTable'

const METRIQ_GYM_SUBMISSION_ID = 800

class MetriqGym extends React.Component {
    constructor (props) {
        super(props)
        this.state = {
            isLoading: true,
            results: [],
            requestFailedMessage: '',
            isLinkBlocked: false
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
    }

    render () {
        return (
            <div id='metriq-main-content' className='container'>
                <h4 align='left'><a href={`/submission/${METRIQ_GYM_SUBMISSION_ID}`}>Metriq-gym results</a></h4>
                <br />
                <AggregatedMetricsTable results={this.state.results} />
            </div>

        )
    }
}

export default withRouter(MetriqGym)
