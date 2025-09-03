import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Tabs, Tab } from 'react-bootstrap'
import config from '../config'
import SortingTable from '../components/SortingTable'
import { useHistory } from 'react-router-dom'

const TopSubmitters = (props) => {
  const [data, setData] = useState({ weekly: [], monthly: [], allTime: [] })
  const history = useHistory()
  
  useEffect(() => {
    if (data.allTime.length) {
      return
    }
    axios.get(config.api.getUriPrefix() + '/user/topSubmitters')
      .then(res => {
        const tSubmitters = res.data.data

        const medalSeries = ['🥇', '🥈', '🥉']

        const ts = { weekly: [], monthly: [], allTime: [] }
        for (let i = 0; i < 3; ++i) {
          if ((tSubmitters.weekly.length > i) && (tSubmitters.weekly[i].submissionsCount > 0)) {
            tSubmitters.weekly[i].rank = medalSeries[i]
            ts.weekly.push(tSubmitters.weekly[i])
          }
          if ((tSubmitters.monthly.length > i) && (tSubmitters.monthly[i].submissionsCount > 0)) {
            tSubmitters.monthly[i].rank = medalSeries[i]
            ts.monthly.push(tSubmitters.monthly[i])
          }
          if ((tSubmitters.allTime.length > i) && (tSubmitters.allTime[i].submissionsCount > 0)) {
            tSubmitters.allTime[i].rank = medalSeries[i]
            ts.allTime.push(tSubmitters.allTime[i])
          }
        }

        setData(ts)
      })
  })

  return (
    <span>
      <h5>Top Submitters</h5>
      {props.isOnlyAllTime &&
        <SortingTable
          columns={[
            {
              title: 'Name',
              key: 'username',
              width: 360
            },
            {
              title: 'Rank',
              key: 'rank',
              width: 80
            },
            {
              title: 'Submission Count',
              key: 'submissionsCount',
              width: 360
            }
          ]}
          data={data.allTime}
          key={Math.random()}
          onRowClick={(record) => history.push('/User/' + record.id + '/Submissions')}
          tableLayout='auto'
          rowClassName='link text-center'
        />}
      {!props.isOnlyAllTime &&
        <Tabs id='top-submissions-tabs'>
          {(data.weekly.length > 0) &&
            <Tab eventKey='Weekly' title='Weekly' className='metriq-nav-tab'>
              <SortingTable
                columns={[
                  {
                    title: 'Name',
                    key: 'username',
                    width: 360
                  },
                  {
                    title: 'Rank',
                    key: 'rank',
                    width: 80
                  },
                  {
                    title: 'Submission Count',
                    key: 'submissionsCount',
                    width: 360
                  }
                ]}
                data={data.weekly}
                key={Math.random()}
                onRowClick={(record) => history.push('/User/' + record.id + '/Submissions')}
                tableLayout='auto'
                rowClassName='link text-center'
              />
            </Tab>}
          {(data.monthly.length > 0) &&
            <Tab eventKey='Monthly' title='Monthly' className='metriq-nav-tab'>
              <SortingTable
                columns={[
                  {
                    title: 'Name',
                    key: 'username',
                    width: 360
                  },
                  {
                    title: 'Rank',
                    key: 'rank',
                    width: 80
                  },
                  {
                    title: 'Submission Count',
                    key: 'submissionsCount',
                    width: 360
                  }
                ]}
                data={data.monthly}
                key={Math.random()}
                onRowClick={(record) => history.push('/User/' + record.id + '/Submissions')}
                tableLayout='auto'
                rowClassName='link text-center'
              />
            </Tab>}
          {(data.allTime.length > 0) &&
            <Tab eventKey='AllTime' title='All Time' className='metriq-nav-tab'>
              <SortingTable
                columns={[
                  {
                    title: 'Name',
                    key: 'username',
                    width: 360
                  },
                  {
                    title: 'Rank',
                    key: 'rank',
                    width: 80
                  },
                  {
                    title: 'Submission Count',
                    key: 'submissionsCount',
                    width: 360
                  }
                ]}
                data={data.allTime}
                key={Math.random()}
                onRowClick={(record) => history.push('/User/' + record.id + '/Submissions')}
                tableLayout='auto'
                rowClassName='link text-center'
              />
            </Tab>}
        </Tabs>}
    </span>
  )
}

export default TopSubmitters
