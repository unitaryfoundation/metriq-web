const About = () => {
  return (
    <div id='metriq-main-content' className='container'>
      <div className='row'>
        <div className='col-md-2' />
        <div className='col-md-8 text-justify'>
          <h1 className='text-center'>Mission</h1>
          <div className='text-start'>
            <p>
              Make transparent, accessible benchmarks available to everyone in the quantum computing community.
            </p>
          </div>
          <br />
          <h1 className='text-center'>About</h1>
          <div className='text-start'>
            <p>
              There has been rapid progress in quantum computing, but it can be hard to track that progress. Researchers want to know how to compare against the state of the art and users want to know what tools would be the best fit for them. Many in the community want to answer the following question:
            </p>
            <p>
              <i>
                “How does quantum computing Platform X running software stack Y perform on workload Z and how has that changed over time?”
              </i>
            </p>
            <p>
              Metriq is a free and open source platform that helps anyone better answer this question for themselves. It is supported by <a href='https://unitary.foundation'>Unitary Foundation</a>, a 501(c)(3) nonprofit organization devoted to research and community-building in quantum computing and quantum open-source software.
            </p>
            <p>
              Researchers and developers in academia and industry can submit results on existing benchmarks or propose new benchmarking tasks to the community. Results include sources and are openly accessible. It is free to sign up and submit.
            </p>
            <p>
              Metriq accelerates research by upgrading the taxonomy of reported results that are often now locked away in tables of review papers. By making the data explorable and live-updated we'll be able to make better progress together to develop quantum technology.
            </p>
          </div>
          <br />
          <h1 className='text-center'>Community</h1>
          <div className='text-start'>
            <p>
              The Metriq community is growing. The <a href='https://discord.com/channels/764231928676089909/818208195612639304'>#metriq</a> channel on the Unitary Foundation <a href='https://discord.com/invite/JqVGmpkP96'>Discord</a> server is visited by folks who share and collaborate on understanding the landscape of quantum benchmarks
            </p>
          </div>
        </div>
        <div className='col-md-2' />
      </div>
    </div>
  )
}

export default About
