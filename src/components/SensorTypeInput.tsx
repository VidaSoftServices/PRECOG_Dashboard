import { useMemo } from 'react';
import { Combobox, Option } from '@fluentui/react-components';
import { useSensorTypes } from '@/api/hooks/sensorTypes';
import { filterSensorTypes } from '@/lib/sensorTypes';

/**
 * The "Sensor type" field: a free-text box that, when focused, drops down the Sensor types already used in the Company so
 * one can be picked with a click instead of retyped. Anything else can still be typed (a new type is just typed). While
 * typing the list narrows to the matches; with an empty box, or a value that is already in the list, the whole list is
 * shown so it can always be re-opened and changed (`filterSensorTypes`). If the suggestions cannot be loaded the field
 * simply works as a plain text box.
 */
export function SensorTypeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const query = useSensorTypes();
  const types = useMemo(() => query.data ?? [], [query.data]);
  const options = useMemo(() => filterSensorTypes(types, value), [types, value]);

  return (
    <Combobox
      freeform
      value={value}
      onChange={(event) => onChange((event.target as HTMLInputElement).value)}
      onOptionSelect={(_, data) => onChange(data.optionText ?? '')}
      autoComplete="off"
    >
      {options.map((type) => (
        <Option key={type} value={type}>
          {type}
        </Option>
      ))}
    </Combobox>
  );
}
