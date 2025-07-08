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
            requestFailedMessage: '',
            results: [],
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
        const { isLoading, requestFailedMessage, results } = this.state;
        if (isLoading) {
            return (
                <div id='metriq-main-content' className='container'>
                    <p>Loading...</p>
                </div>
            );
        }
        if (requestFailedMessage) {
            return (
                <div id='metriq-main-content' className='container'>
                    <p>Error: {requestFailedMessage}</p>
                </div>
            );
}
        return (            
            <div id='metriq-main-content' className='container'>
              <h3 style={{ textAlign: "left" }}><a href={`/submission/${METRIQ_GYM_SUBMISSION_ID}`}>metriq-gym results</a></h3>
                <p
                    style={{
                        textAlign: "left",
                        maxWidth: "680px",
                        fontSize: "1.15rem",
                        lineHeight: 1.7,
                        padding: "24px 32px",
                        margin: "32px 0",
                        display: "block"
                    }}
                >
                  Benchmark results in this page are collected using the <a href='https://github.com/unitaryfoundation/metriq-gym'>metriq-gym</a> toolkit.
                  They are run by the Unitary Foundation team on a variety of platforms.
                </p>
              <br />
              <AggregatedMetricsTable results={results} />
            </div>
        )
    }
}

export default withRouter(MetriqGym)
