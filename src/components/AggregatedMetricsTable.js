import React, { Suspense } from 'react'
import FormFieldWideRow from './FormFieldWideRow'
const SortingTable = React.lazy(() => import('./SortingTable'))

const AggregatedMetricsTable = (props) => {
  const { results } = props

  // Use taskName + metricName as the column key and title
  const metricKeys = results.map(row => ({
    key: `${row.taskName || '(Unknown Task)'} – ${row.metricName}`,
    taskName: row.taskName || '(Unknown Task)',
    metricName: row.metricName
  }))
  const uniqueMetricKeys = Array.from(
    new Map(metricKeys.map(item => [item.key, item])).values()
  )

  // Aggregate data by provider/device and use the new metric key
  const aggregatedData = results.reduce((acc, row) => {
    const providerName = row.provider || '(Unknown Provider)'
    const deviceName = row.device || '(Unknown Device)'
    const key = `${providerName}-${deviceName}`

    if (!acc[key]) {
      acc[key] = {
        key,
        providerName,
        deviceName,
        metrics: {}
      }
    }

    const metricKey = `${row.taskName || '(Unknown Task)'} – ${row.metricName}`
    acc[key].metrics[metricKey] = row.metricValue
    return acc
  }, {})

  const tableData = Object.values(aggregatedData)

  const metricColumns = uniqueMetricKeys.map(({ key }) => ({
    title: key,
    key,
    width: 160
  }))

  return (
    <FormFieldWideRow>
        <div className='card-text'>
          {(tableData.length > 0) &&
            <Suspense fallback={<div>Loading...</div>}>
              <SortingTable
                scrollX
                columns={[
                  {
                    title: 'Provider',
                    key: 'providerName',
                    width: 150
                  },
                  {
                    title: 'Device',
                    key: 'deviceName',
                    width: 150
                  },
                  ...metricColumns
                ]}
                data={tableData.map(row => ({
                  key: row.key,
                  providerName: row.providerName,
                  deviceName: row.deviceName,
                  ...row.metrics
                }))}
                tableLayout='auto'
              />
            </Suspense>}
          {(tableData.length === 0) &&
            <div className='card bg-light'>
              <div className='card-body'>There are no metrics to display.</div>
            </div>}
        </div>
    </FormFieldWideRow>
  )
}

export default AggregatedMetricsTable
