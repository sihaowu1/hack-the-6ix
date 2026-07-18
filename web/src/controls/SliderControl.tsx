import type { TunableParam } from '@motionforge/shared';
import type { ParamChange } from './ControlsPanel';

interface Props {
  param: TunableParam;
  onChange: ParamChange;
}

export function SliderControl({ param, onChange }: Props) {
  const value = Number(param.value);
  return (
    <label className="control">
      <span className="control-label">
        {param.label}
        <span className="control-value">{value}</span>
      </span>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        onChange={(event) => onChange(param.name, Number(event.target.value))}
      />
    </label>
  );
}
