import { describe, expect, it } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { enGB } from 'date-fns/locale'
import {
  dateInputToIso,
  dateRangeReversed,
  formatDate,
  isValidDate,
  isoToDateInput,
} from './date.js'

describe('isValidDate', () => {
  it('accepts a parseable date and rejects everything else', () => {
    expect(isValidDate('2026-08-21T13:30:00.000Z')).toBe(true)
    expect(isValidDate('2026-08-21')).toBe(true)
    expect(isValidDate('nonsense')).toBe(false)
    expect(isValidDate('')).toBe(false)
    expect(isValidDate(null)).toBe(false)
    expect(isValidDate(undefined)).toBe(false)
  })

  // Only the check `new Date` itself performs. An out-of-range MONTH is unparseable, but an
  // out-of-range DAY rolls over silently - Feb 30th becomes March 2nd and reads as valid. Anywhere
  // a typo'd day must be refused rather than moved, this is not the guard to reach for.
  it('rejects an unparseable month but accepts a day that rolls over', () => {
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026-02-30T00:00:00.000Z')).toBe(true)
    expect(new Date('2026-02-30T00:00:00.000Z').getUTCMonth()).toBe(2)
  })
})

describe('dateRangeReversed', () => {
  it('spots an end before its start', () => {
    expect(dateRangeReversed('2026-08-21', '2026-08-20')).toBe(true)
    expect(dateRangeReversed('2026-08-21', '2026-08-22')).toBe(false)
  })

  // A zero-length window is legal, so equal instants are NOT reversed.
  it('treats equal instants as in order', () => {
    expect(dateRangeReversed('2026-08-21', '2026-08-21')).toBe(false)
    expect(dateRangeReversed('2026-08-21T10:00:00.000Z', '2026-08-21T10:00:00.000Z')).toBe(false)
  })

  it('compares instants, not strings', () => {
    expect(dateRangeReversed('2026-08-21T10:00:00.000Z', '2026-08-21T09:59:59.999Z')).toBe(true)
  })
})

describe('datetime-local round trip', () => {
  // The input's value is LOCAL wall-clock time with no zone, so the pair has to compose and
  // decompose through local parts - a toISOString().slice() would shift by the viewer's offset.
  it('returns the same wall-clock value it was given', () => {
    const input = '2026-08-21T14:30'
    const iso = dateInputToIso(input)

    expect(iso).not.toBeNull()
    expect(isoToDateInput(iso)).toBe(input)
  })

  it('round trips a value in the other direction', () => {
    const iso = new Date(2026, 7, 21, 9, 5).toISOString()

    expect(dateInputToIso(isoToDateInput(iso))).toBe(iso)
  })

  it('pads single-digit months, days, hours and minutes', () => {
    const iso = new Date(2026, 0, 2, 3, 4).toISOString()

    expect(isoToDateInput(iso)).toBe('2026-01-02T03:04')
  })

  // `new Date('nonsense').toISOString()` is a RangeError, so both directions have to answer with
  // the field's own empty value instead.
  it('uses each side’s empty value rather than throwing', () => {
    expect(dateInputToIso('')).toBeNull()
    expect(dateInputToIso('nonsense')).toBeNull()
    expect(isoToDateInput('')).toBe('')
    expect(isoToDateInput('nonsense')).toBe('')
    expect(isoToDateInput(null)).toBe('')
    expect(isoToDateInput(undefined)).toBe('')
  })
})

describe('formatDate', () => {
  const stamp = new Date(2026, 7, 21, 14, 5)

  it('formats a Date, an ISO string and an epoch alike', () => {
    expect(formatDate(stamp, 'yyyy-MM-dd')).toBe('2026-08-21')
    expect(formatDate(stamp.toISOString(), 'yyyy-MM-dd')).toBe('2026-08-21')
    expect(formatDate(stamp.getTime(), 'yyyy-MM-dd')).toBe('2026-08-21')
  })

  it('honours the pattern it was given', () => {
    expect(formatDate(stamp, 'HH:mm')).toBe('14:05')
    expect(formatDate(stamp, 'd MMM yyyy')).toBe('21 Aug 2026')
  })

  // Passing the locale through is the whole point of the wrapper: without it, month and weekday
  // tokens render in date-fns's default (US English) whatever language is in scope.
  it('renders month and weekday tokens in the locale it was given', () => {
    expect(formatDate(stamp, 'EEEE', enGB)).toBe('Friday')
    expect(formatDate(new Date(2026, 0, 1), 'MMMM', enGB)).toBe('January')
  })

  it('falls back to the default locale when none is given', () => {
    expect(formatDate(stamp, 'EEEE')).toBe('Friday')
  })

  // A `Date` must reach date-fns unchanged. Re-wrapping it in `new Date(value)` would keep the
  // instant but drop the subclass, so a UTCDate would render in the machine's zone instead of UTC.
  it('keeps the zone of a Date subclass such as UTCDate', () => {
    expect(formatDate(new UTCDate(2026, 7, 21, 23, 30), 'yyyy-MM-dd HH:mm')).toBe(
      '2026-08-21 23:30',
    )
  })
})
