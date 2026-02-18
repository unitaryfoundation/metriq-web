class MetriqTour {
  constructor () {
    this.STORAGE_KEY = 'metriq_tour_completed'
    // Fix for Driver.js CDN potentially namespacing the constructor
    const driverConstructor = window.driver?.js?.driver || window.driver
    if (!driverConstructor) {
      console.error('MetriqTour: Driver.js not loaded')
      return
    }
    this.driverObj = driverConstructor({
      showProgress: true,
      animate: true,
      steps: this.getSteps(),
      doneBtnText: 'Done',
      closeBtnText: 'Close',
      nextBtnText: 'Next',
      prevBtnText: 'Previous',
      onDestroyStarted: () => {
        if (!this.driverObj.hasNextStep() || confirm('Are you sure you want to exit the tour?')) {
          this.driverObj.destroy()
          // Mark as seen only when fully dismissed or finished
          localStorage.setItem(this.STORAGE_KEY, 'true')
        }
      }
    })
  }

  getSteps () {
    return [
      {
        element: '.brand',
        popover: {
          title: 'Welcome to Metriq',
          description: 'The community-driven platform for benchmarking quantum hardware and compilers. Navigate the performance landscape.',
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: '.tabs--views',
        popover: {
          title: 'Primary Navigation',
          description: 'Switch between the high-level Platform Leaderboard, granular Benchmark Results, and Documentation.',
          side: 'bottom',
          align: 'center'
        }
      },
      {
        element: '#view-platforms-btn',
        popover: {
          title: 'Platform Leaderboard',
          description: 'Compare global quantum systems using the aggregated Metriq Score—a normalized performance metric across diverse architectures.',
          side: 'bottom',
          align: 'center'
        },
        onHighlightStarted: () => {
          window.scrollTo({ top: 0, behavior: 'auto' })
          document.getElementById('view-platforms-btn')?.click()
          document.body.offsetHeight // Force reflow
        }
      },
      {
        element: '#platforms-container', // Target container instead of table to be safer
        popover: {
          title: 'Device Specifications',
          description: 'Drill down into QPU details, qubit counts, and historical performance metrics for specific hardware backends.',
          side: 'top',
          align: 'center'
        },
        onHighlightStarted: () => {
          document.getElementById('view-platforms-btn')?.click()
          document.body.offsetHeight
        }
      },
      {
        element: '.link-platforms-json',
        popover: {
          title: 'Platforms Index JSON',
          description: 'Download the complete dataset of quantum platforms in JSON format for offline analysis.',
          side: 'left',
          align: 'center'
        },
        onHighlightStarted: () => {
          document.getElementById('view-platforms-btn')?.click()
        }
      },
      {
        element: '#view-results-btn',
        popover: {
          title: 'Benchmark Analysis',
          description: 'Analyze raw submission data. Track performance trends across different compiler passes and quantum stacks.',
          side: 'bottom',
          align: 'center'
        },
        onHighlightStarted: () => {
          window.scrollTo({ top: 0, behavior: 'auto' })
          document.getElementById('view-results-btn')?.click()
          document.body.offsetHeight // Force reflow
        }
      },
      {
        element: '#panel-graph', // Target the graph panel
        popover: {
          title: 'Performance Trends',
          description: 'Visualize metric evolution. Track improvements in gate fidelity, compilation efficiency, and algorithmic success rates.',
          side: 'left',
          align: 'center'
        },
        onHighlightStarted: () => {
          document.getElementById('view-results-btn')?.click()
          document.getElementById('tab-graph')?.click()
          document.body.offsetHeight
        }
      },
      {
        element: '.smart-controls',
        popover: {
          title: 'Parametric Filtering',
          description: 'Isolate specific variables. Slice the dataset by Cloud Provider, Hardware Backend, or Benchmark Protocol.',
          side: 'bottom',
          align: 'center'
        },
        onHighlightStarted: () => {
          document.getElementById('view-results-btn')?.click()
          document.getElementById('tab-table')?.click() // Filter step needs table view
          document.body.offsetHeight
        }
      },
      {
        element: '#panel-table', // Target the table panel
        popover: {
          title: 'Raw Data Matrix',
          description: 'Access the underlying dataset. Sort and extract specific run parameters, timestamps, and metric values.',
          side: 'left',
          align: 'center'
        },
        onHighlightStarted: () => {
          document.getElementById('view-results-btn')?.click()
          document.getElementById('tab-table')?.click()
          document.body.offsetHeight
        }
      },
      {
        element: '#view-benchmarks-btn',
        popover: {
          title: 'Benchmark Definitions',
          description: 'Reference the Metriq Gym documentation. Understand the circuit depth, width, and success criteria for each test.',
          side: 'bottom',
          align: 'center'
        },
        onHighlightStarted: () => {
          window.scrollTo({ top: 0, behavior: 'auto' })
          document.getElementById('view-benchmarks-btn')?.click()
          document.body.offsetHeight
        }
      },
      {
        element: '.brand', // Back to start/neutral
        popover: {
          title: 'Start Exploring',
          description: 'You are ready to analyze the state of the art. Restart this tour via the help icon at any time.',
          side: 'bottom',
          align: 'start'
        },
        onHighlightStarted: () => {
          // Reset to default view at the end? Or leave them where they are.
          // Let's go back to platforms as it's the "home" view.
          document.getElementById('view-platforms-btn')?.click()
        }
      }
    ]
  }

  start () {
    if (!this.driverObj) return
    this.driverObj.drive()
  }

  checkFirstVisit () {
    if (!this.driverObj) return
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      // Optional: Delay slightly to allow page to settle
      setTimeout(() => {
        this.start()
      }, 1000)
    }
  }
}

// Global instance to be used by main.ts or inline script
window.MetriqTour = MetriqTour
