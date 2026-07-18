import type { TunableParam } from '@motionforge/shared';
import type { ParamChange } from './ControlsPanel';

interface Props {
  param: TunableParam;
  onChange: ParamChange;
}

export function ColorControl({ param, onChange }: Props) {
  const value = String(param.value);
  return (
    <label className="control color">
      <span className="control-label">
        {param.label}
        <span className="control-value">{value}</span>
      </span>
      <input
        type="color"
        value={normalizeHex(value)}
        onChange={(event) => onChange(param.name, event.target.value)}
      />
    </label>
  );
}

// <input type="color"> requires #rrggbb; expand #rgb shorthand.
function normalizeHex(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff';
}
