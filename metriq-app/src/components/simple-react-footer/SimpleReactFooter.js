import React from 'react'
import PropTypes from 'prop-types'
import './SimpleReactFooter.css'
import MailchimpSubscribe from 'react-mailchimp-subscribe'
import { FaDiscord, FaGithub, FaPinterestSquare, FaTwitterSquare } from 'react-icons/fa'
import { ImFacebook2, ImInstagram, ImLinkedin, ImTwitch, ImYoutube } from 'react-icons/im'
import { Button } from 'react-bootstrap'
import logo from './../../images/uf_logo.svg'

const CustomMailchimpForm = ({ status, message, onValidated }) => {
  let email
  const submit = () =>
    email &&
    email.value.indexOf('@') > -1 &&
    onValidated({
      EMAIL: email.value
    })

  return (
    <div>
      {status === 'sending' && <div style={{ color: 'blue' }}>sending...</div>}
      {status === 'error' && (
        <div
          style={{ color: 'red' }}
          dangerouslySetInnerHTML={{ __html: message }}
        />
      )}
      {status === 'success' && (
        <div
          style={{ color: 'green' }}
          dangerouslySetInnerHTML={{ __html: message }}
        />
      )}
      <input
        ref={node => (email = node)}
        type='email'
        placeholder='Your email'
      />
      <Button variant='primary' className='metriq-footer-button' onClick={submit}>Submit</Button>
    </div>
  )
}

class SimpleReactFooter extends React.Component {
  render () {
    return (
      <div ref={(divElement) => { this.divElement = divElement }} className='footer-div'>
        <div style={{ backgroundColor: this.props.backgroundColor || 'bisque', color: this.props.fontColor }} className='footer-container'>
          <div className='first-row'>
            <div style={{ color: this.props.fontColor || 'black' }} className='stay-connected-title row'>
              <div className='col-sm-1' />
              <div className='col-sm-7'>
                Quantum computing benchmarks by <a href='https://github.com/unitaryfoundation/metriq-app'>community contributors</a> made with <div id='heart' /> by <a href='https://unitary.foundation'><img width='64px' src={logo} alt='Unitary Foundation logo' /></a><br />
                <span className='stay-connected-shim' /><br />
                Stay up to date on metriq.info! Subscribe now to our newsletter:&nbsp;
                <div className='email-subscribe'>
                  <MailchimpSubscribe
                    url='https://fund.us18.list-manage.com/subscribe/post?u=104796c75ced8350ebd01eebd&amp;id=a2c9e5ac2a'
                    render={({ subscribe, status, message }) => (
                      <CustomMailchimpForm
                        status={status}
                        message={message}
                        onValidated={formData => subscribe(formData)}
                      />
                    )}
                  />
                </div>
              </div>
              <div className='col-sm-4 text-center'>
                Follow us on social media<br />
                <span className='stay-connected-shim' /><br />
                {(this.props.facebook !== undefined || this.props.linkedin !== undefined || this.props.instagram !== undefined || this.props.twitter !== undefined || this.props.pinterest !== undefined || this.props.youtube !== undefined) &&
                  <div className='social-media' style={{ color: this.props.fontColor }}>
                    {this.props.facebook !== undefined ? <a aria-label='Facebook' href={`https://www.facebook.com/${this.props.facebook}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><ImFacebook2 color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.twitter !== undefined ? <a aria-label='Twitter' href={`https://www.twitter.com/${this.props.twitter}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><FaTwitterSquare color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.github !== undefined ? <a aria-label='GitHub' href={`https://github.com/${this.props.github}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><FaGithub color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.twitch !== undefined ? <a aria-label='Twitch' href={`https://www.twitch.tv/${this.props.twitch}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><ImTwitch color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.youtube !== undefined ? <a aria-label='YouTube' href={`https://www.youtube.com/channel/${this.props.youtube}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><ImYoutube color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.discord !== undefined ? <a aria-label='Discord' href={`http://discord.${this.props.discord}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><FaDiscord color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.instagram !== undefined ? <a aria-label='Instagram' href={`https://www.instagram.com/${this.props.instagram}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><ImInstagram color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.linkedin !== undefined ? <a aria-label='LinkedIn' href={`https://www.linkedin.com/company/${this.props.linkedin}`} target='_blank' rel='noreferrer' className='socialMediaLogo'><ImLinkedin color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                    {this.props.pinterest !== undefined ? <a aria-label='Pinterest' href={`https://www.pinterest.com/${this.props.pinterest}`} target=' _blank' rel='noreferrer' className='socialMediaLogo'><FaPinterestSquare color={`${this.props.iconColor || 'black'}`} size={25} /> </a> : ''}
                  </div>}
              </div>
            </div>
            <div style={{ color: this.props.fontColor || 'black' }} className='license-row row'>
              <div className='col-sm-1' />
              <div className='copyright col-sm-11'>All content on this website is openly licensed under <a href='https://creativecommons.org/licenses/by-sa/4.0/'>CC-BY-SA</a>. Members agree to the <a href='/MetriqTermsofUse' target='_blank'>Metriq Platform Terms of Use</a>.</div>
            </div>
            <div style={{ color: this.props.fontColor || 'black' }} className='copyright-row row'>
              <div className='col-sm-1' />
              <div className='copyright col-sm-11'>Copyright &copy; {this.props.copyright}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

SimpleReactFooter.propTypes = {
  description: PropTypes.string,
  linkedin: PropTypes.string,
  instagram: PropTypes.string,
  facebook: PropTypes.string,
  twitch: PropTypes.string,
  youtube: PropTypes.string,
  pinterest: PropTypes.string,
  title: PropTypes.string,
  copyright: PropTypes.string,
  iconColor: PropTypes.string,
  backgroundColor: PropTypes.string,
  fontColor: PropTypes.string,
  copyrightColor: PropTypes.string
}

export default SimpleReactFooter
