import './App.css'
import MainRouter from './MainRouter'
import SimpleReactFooter from './components/simple-react-footer/SimpleReactFooter'

const App = () => {
  const currentYear = new Date().getFullYear()
  const copyrightYear = `2021-${currentYear} Unitary Foundation`

  return (
    <div className='App'>
      <MainRouter />
      <SimpleReactFooter
        title='metriq'
        description='Quantum computing benchmarks by community contributors'
        copyright={copyrightYear}
        discord='unitary.foundation'
        github='unitaryfoundation'
        twitch='unitaryfoundation'
        twitter='unitaryfoundation'
        youtube='UCDbDLAzGRTHnhkoMMOX7D1A'
        linkedin='unitary-fund'
        backgroundColor='#04165D'
        fontColor='#FFFFFF'
        iconColor='#FFFFFF'
        copyrightColor='#FFFFFF'
      />
    </div>
  )
}

export default App
