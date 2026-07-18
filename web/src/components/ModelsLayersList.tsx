import { useMemo, useState } from 'react';
import { extractLayers } from '@motionforge/shared';
import { CaretRight } from '@phosphor-icons/react';
import type { SceneModel } from '../state/useSceneProject';

interface Props {
  models: SceneModel[];
  activeModelId: string;
  selectedModelIds: string[];
  onSelectModel: (id: string, options?: { shiftKey?: boolean }) => void;
  onMergeSelected: () => void;
}

/**
 * One row per generated scene/model, expandable to show its layers (the mesh
 * groups `buildScene` returns — see `shared/src/layers.ts`). Merged models
 * expand to a dropdown of their child model names instead.
 *
 * Click activates a single model; shift-click adds/removes from a multi-select
 * set. With two or more selected, Merge builds a co-view group.
 */
export function ModelsLayersList({
  models,
  activeModelId,
  selectedModelIds,
  onSelectModel,
  onMergeSelected,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const layersByModel = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const model of models) map.set(model.id, extractLayers(model.code));
    return map;
  }, [models]);

  const modelsById = useMemo(() => {
    const map = new Map<string, SceneModel>();
    for (const model of models) map.set(model.id, model);
    return map;
  }, [models]);

  const canMerge = selectedModelIds.length >= 2;

  if (models.length === 0) {
    return (
      <p className="m-0 text-[13px] leading-relaxed text-text-dim">
        No models yet. Generate one from the chat above to see it listed here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canMerge}
          onClick={onMergeSelected}
          title={
            canMerge
              ? 'Place selected models side-by-side on one plane'
              : 'Shift-click two or more models to merge'
          }
        >
          Merge selected
        </button>
        <span className="text-[11px] text-text-dim">
          {canMerge
            ? `${selectedModelIds.length} selected`
            : 'Shift-click to select multiple'}
        </span>
      </div>

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {models.map((model) => {
          const layers = layersByModel.get(model.id) ?? [];
          const expanded = expandedId === model.id;
          const active = model.id === activeModelId;
          const selected = selectedModelIds.includes(model.id);
          const isMerge = Boolean(model.childIds?.length);
          const childModels = (model.childIds ?? [])
            .map((id) => modelsById.get(id))
            .filter((m): m is SceneModel => Boolean(m));
          const badgeCount = isMerge ? childModels.length : layers.length;

          return (
            <li
              key={model.id}
              className={`overflow-hidden rounded-md border bg-bg-raised ${
                active || selected ? 'border-accent' : 'border-border'
              } ${selected && !active ? 'bg-accent/5' : ''}`}
            >
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-none border-none bg-transparent px-2.5 py-2 text-left font-medium transition-colors hover:bg-bg-hover ${
                  active || selected ? 'text-accent' : 'text-text'
                }`}
                aria-expanded={expanded}
                aria-pressed={selected}
                onClick={(event) => {
                  onSelectModel(model.id, { shiftKey: event.shiftKey });
                  if (!event.shiftKey) {
                    setExpandedId(expanded ? null : model.id);
                  }
                }}
              >
                <CaretRight
                  size={12}
                  weight="bold"
                  className={`flex-shrink-0 text-text-dim transition-transform duration-150 ease-out ${
                    expanded ? 'rotate-90' : ''
                  }`}
                  aria-hidden="true"
                />
                <span
                  className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                  title={model.name}
                >
                  {model.name}
                  {isMerge ? (
                    <span className="ml-1.5 font-normal text-text-dim">· merge</span>
                  ) : null}
                </span>
                <span
                  className="min-w-[20px] flex-shrink-0 rounded-full border border-border bg-bg px-1.5 py-px text-center text-[11px] tabular-nums text-text-dim"
                  title={
                    isMerge
                      ? `${badgeCount} model(s) in merge`
                      : `${badgeCount} layer(s)`
                  }
                >
                  {badgeCount}
                </span>
              </button>
              {expanded && (
                <ul className="m-0 flex flex-col gap-0.5 py-0 pl-[30px] pr-2.5 pb-2">
                  {isMerge ? (
                    childModels.length === 0 ? (
                      <li className="font-sans text-[12px] italic text-text-dim">
                        No child models found
                      </li>
                    ) : (
                      childModels.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            className="w-full border-none bg-transparent px-0 py-0.5 text-left font-sans text-[12px] text-text-dim hover:text-text"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectModel(child.id, { shiftKey: event.shiftKey });
                            }}
                          >
                            {child.name}
                          </button>
                        </li>
                      ))
                    )
                  ) : layers.length === 0 ? (
                    <li className="font-sans text-[12px] italic text-text-dim">
                      No mesh groups found
                    </li>
                  ) : (
                    layers.map((layer) => (
                      <li key={layer} className="font-mono text-[12px] text-text-dim">
                        {layer}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
