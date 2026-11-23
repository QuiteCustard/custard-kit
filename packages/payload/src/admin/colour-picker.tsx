'use client'
import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'

/** Shown by the colour input while the field is empty; the field itself stays empty. */
const emptySwatch = '#000000'

/**
 * The admin component `colourPickerField` renders by default: the browser's colour input over a
 * text field, with the value beside it and a Clear button. The field stays empty until a colour is
 * picked, so an empty value can mean "use the default". The browser's input has no transparency, so
 * a field that needs `rgba(…)` should stay a plain text field.
 */
export const ColourPicker: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { value, setValue, showError, errorMessage, disabled } = useField<string | null>({ path })
  const { label, required, localized, admin } = field
  const description = typeof admin?.description === 'function' ? undefined : admin?.description
  const id = `field-${path.replace(/\./g, '__')}`
  const locked = readOnly || disabled

  // The admin panel loads no Tailwind, so the layout is inline; the rest is Payload's own classes.
  return (
    <div className="field-type text">
      <FieldLabel
        htmlFor={id}
        label={label}
        localized={localized}
        path={path}
        required={required}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <input
          id={id}
          type="color"
          value={value || emptySwatch}
          disabled={locked}
          onChange={(event) => setValue(event.target.value)}
          style={{ width: '3rem', height: '2.5rem', padding: 0, border: 0, background: 'none' }}
        />
        <span>{value || 'Not set'}</span>
        {value && !locked ? (
          <button
            type="button"
            className="btn btn--style-secondary btn--size-small btn--no-margin"
            onClick={() => setValue(null)}
          >
            Clear
          </button>
        ) : null}
      </div>
      <FieldError message={errorMessage} path={path} showError={showError} />
      <FieldDescription description={description} path={path} />
    </div>
  )
}

export default ColourPicker
