import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Field, makeStyles, tokens } from '@fluentui/react-components';
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
      <DatePicker
        // react-datepicker renders a plain, non-Fluent <input> - Field's
        // automatic label<->control id wiring only works for Fluent-aware
        // children, so the label association needs to be spelled out
        // explicitly here or axe's "label" rule flags it despite the
        // visible Field label right above it.
        aria-label={`${label} (${localZone()})`}
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
    </Field>
  );
}
