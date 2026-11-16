import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { formatTaskState } from '../task/format-task-state';
import { listedStates } from '../task/listed-state';
import type { ListedState } from '../task/listed-state';
import type { TaskDefinition } from '../task/use-task-definitions';

export interface DashboardFilters {
  readonly definition?: string;
  readonly state?: ListedState;
}

export interface TaskFiltersProps {
  readonly definitions: readonly TaskDefinition[];
  readonly filters: DashboardFilters;
  readonly isDefinitionShown: boolean;

  readonly onFiltersChange: (filters: DashboardFilters) => void;
}

const bar = css({ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: '3' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

export function TaskFilters(props: TaskFiltersProps): ReactNode {
  const filters = props.filters;
  const isFiltered = filters.definition !== undefined || filters.state !== undefined;

  return (
    <div aria-label="Filters" className={bar} role="group">
      {props.isDefinitionShown ? (
        <label className={field}>
          Definition
          <select
            onChange={(event) => {
              props.onFiltersChange({
                ...(filters.state === undefined ? {} : { state: filters.state }),
                ...(event.target.value === '' ? {} : { definition: event.target.value }),
              });
            }}
            value={filters.definition ?? ''}
          >
            <option value="">All</option>
            {props.definitions.map((definition) => (
              <option key={definition.definitionID} value={definition.definitionID}>
                {definition.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={field}>
        State
        <select
          onChange={(event) => {
            const picked = listedStates.find((state) => state === event.target.value);

            props.onFiltersChange({
              ...(filters.definition === undefined ? {} : { definition: filters.definition }),
              ...(picked === undefined ? {} : { state: picked }),
            });
          }}
          value={filters.state ?? ''}
        >
          <option value="">All</option>
          {listedStates.map((state) => (
            <option key={state} value={state}>
              {formatTaskState(state)}
            </option>
          ))}
        </select>
      </label>
      {isFiltered ? (
        <button
          onClick={() => {
            props.onFiltersChange({});
          }}
          type="button"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
