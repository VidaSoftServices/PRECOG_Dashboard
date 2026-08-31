import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Field, makeStyles, tokens, type FieldControlProps } from '@fluentui/react-components';
import { localZone } from '@/lib/dateTime';

const useStyles = makeStyles({
  // react-datepicker ships its own CSS; these overrides make its input match
  // Fluent's Input visually so it doesn't read as a foreign control embedded
  // in an otherwise-Fluent page (decision #7: "visually integrates with
  // Fluent UI v9").
  wrap: {
    '& .react-datepicker-wrapper': { width: '100%' },
    '& .react-datepicker__input-container input': {
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: tokens.fontFamilyBase,
      fontSize: tokens.fontSizeBase300,
      padding: '5px 8px',
      borderRadius: tokens.borderRadiusMedium,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      background: tokens.colorNeutralBackground1,
      color: tokens.colorNeutralForeground1,
    },
    '& .react-datepicker__input-container input:focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '1px',
    },
  },
});

interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  /** Surfaced by the caller after comparing against a paired field, e.g. "Start must be before end." */
  validationMessage?: string;
}

/**
 * Keeps react-datepicker (decision #7 - it's the only picker in the project
 * with second-granularity time selection) but wraps it in a Fluent Field so
 * labeling, validation messaging, and focus styling are consistent with
 * every other form control. The viewer's local zone is always shown next to
 * the label so a value is never silently ambiguous between local time and
 * UTC - callers convert to ISO 8601 (src/lib/dateTime.ts: toApiIso) only at
 * the API boundary.
 *
 * Uses Field's documented render-prop child form (`FieldProps.children`'s
 * own JSDoc: "The control itself can merge props from field with
 * useFieldControlProps_unstable()... <Field>{(props) => <MyInput
 * {...props} />}</Field>"), not a plain `aria-label` prop on `<DatePicker>`.
 * A prior version passed `aria-label` directly - it type-checked (Fluent's
 * JSX types don't constrain arbitrary props on a foreign class component)
 * but had no runtime effect: react-datepicker's own `renderDateInput`
 * (node_modules/react-datepicker/dist/index.js) clones a fixed allow-list of
 * named props onto its real `<input>` - `id`, `name`, `aria-describedby`,
 * `aria-invalid`, `aria-labelledby`, `aria-required`, and a few more - and
 * `aria-label` is not among them, so it was silently dropped every time.
 * Confirmed both statically (reading that allow-list) and at runtime (a
 * real rendered `<input>` had no `aria-label`, no `id`, and no
 * `aria-labelledby` - axe correctly flagged it "Form elements must have
 * labels", critical). `id`/`ariaLabelledBy`/`ariaDescribedBy`/`ariaInvalid`
 * *are* on that allow-list, so Field's render-prop values (which target
 * exactly those attribute names) reach the real input correctly.
 */
export function DateTimeField({ label, value, onChange, minDate, maxDate, disabled, validationMessage }: DateTimeFieldProps) {
  const styles = useStyles();
  return (
    <Field
      label={`${label} (${localZone()})`}
      validationState={validationMessage ? 'error' : 'none'}
      validationMessage={validationMessage}
      className={styles.wrap}
    >
      {(fieldProps: FieldControlProps) => (
        <DatePicker
          id={fieldProps.id}
          ariaLabelledBy={fieldProps['aria-labelledby']}
          ariaDescribedBy={fieldProps['aria-describedby']}
          ariaInvalid={fieldProps['aria-invalid'] === undefined ? undefined : String(fieldProps['aria-invalid'])}
          selected={value}
          onChange={onChange}
          showTimeSelect
          timeFormat="HH:mm:ss"
          timeIntervals={1}
          dateFormat="yyyy-MM-dd HH:mm:ss"
          minDate={minDate}
          maxDate={maxDate}
          disabled={disabled}
          autoComplete="off"
          popperPlacement="bottom-start"
        />
      )}
    </Field>
  );
}
