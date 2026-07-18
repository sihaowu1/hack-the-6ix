import type { TunableParam } from '@motionforge/shared';
import { SliderControl } from './SliderControl';
import { SwitchControl } from './SwitchControl';
import { ColorControl } from './ColorControl';

export type ParamChange = (name: string, value: number | boolean | string) => void;

interface Props {
  tunables: TunableParam[];
  onChange: ParamChange;
}

/**
 * Renders one control per @tunable PARAMS entry in the generated code:
 * numbers → sliders, booleans → switches, hex colors → color pickers.
 * Every change is written back into the code (patchParam), so the code stays
 * the single source of truth.
 */
export function ControlsPanel({ tunables, onChange }: Props) {
  return (
    <section className="panel">
      <h2>Controls</h2>
      {tunables.length === 0 ? (
        <p className="hint">
          No tunable parameters found. Annotate PARAMS entries with <code>@tunable</code> to get
          sliders and switches.
        </p>
      ) : (
        tunables.map((param) => {
          if (param.type === 'number') {
            return <SliderControl key={param.name} param={param} onChange={onChange} />;
          }
          if (param.type === 'boolean') {
            return <SwitchControl key={param.name} param={param} onChange={onChange} />;
          }
          return <ColorControl key={param.name} param={param} onChange={onChange} />;
        })
      )}
    </section>
  );
}
