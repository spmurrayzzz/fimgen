import { createSignal, createEffect, For, Show } from 'solid-js';
import axios from 'axios';

const DatasetList = (props) => {
  const [datasets, setDatasets] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(null);

  createEffect(async () => {
    try {
      const response = await axios.get('/api/datasets');
      setDatasets(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load datasets');
      setLoading(false);
    }
  });

  return (
    <div class="dataset-list">
      <div class="header">
        <h2>Datasets</h2>
      </div>
      <div class="list-content">
        <Show when={!loading()} fallback={<div class="loading">Loading...</div>}>
          <Show when={!error()} fallback={<div class="error">{error()}</div>}>
            <For each={datasets()}>
              {(dataset) => (
                <button
                  class={`dataset-item ${props.selectedDataset === dataset ? 'selected' : ''}`}
                  onClick={() => props.onSelect(dataset)}
                  title={dataset}
                >
                  <span>{dataset}</span>
                </button>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default DatasetList;
