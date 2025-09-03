const FormFieldWideRow = (props) =>
  <div id={props.id} className='row'>
    <div className={'col-md-12 ' + (props.className ? props.className : '')}>
      {props.children}
    </div>
  </div>

export default FormFieldWideRow
