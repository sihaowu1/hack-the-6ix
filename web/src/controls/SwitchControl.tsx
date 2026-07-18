import type { TunableParam } from '@motionforge/shared';
import type { ParamChange } from './ControlsPanel';

interface Props {
  param: TunableParam;
  onChange: ParamChange;
}

export function SwitchControl({ param, onChange }: Props) {
  const checked = param.value === true;
  return (
    <label className="control switch">
      <span className="control-label">{param.label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(param.name, event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}
