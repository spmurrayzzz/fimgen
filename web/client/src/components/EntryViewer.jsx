import { createSignal, createEffect, Show } from 'solid-js';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';

const CodeBlock = (props) => {
  let codeRef;

  createEffect(() => {
    if (!props.editing && codeRef) {
      codeRef.textContent = props.code;
      Prism.highlightElement(codeRef);
    }
  });

  return (
    <div class="code-block">
      <div class="code-header" style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
        <span>{props.label}</span>
        <Show when={props.onEdit}>
          <button
            onClick={props.onEdit}
            style={{ "font-size": "0.75rem", padding: "0.25rem 0.5rem", background: "#374151", border: "none", color: "white", "border-radius": "0.25rem", cursor: "pointer" }}
          >
            {props.editing ? 'Save' : 'Edit'}
          </button>
        </Show>
      </div>
      <Show when={props.editing} fallback={
        <pre><code ref={codeRef} class={`language-${props.language || 'javascript'}`}></code></pre>
      }>
        <textarea
          value={props.code}
          onInput={(e) => props.onChange(e.target.value)}
          style={{
            width: "100%",
            height: "300px",
            background: "#0d1117",
            color: "#f3f4f6",
            border: "none",
            padding: "1rem",
            "font-family": "monospace",
            resize: "vertical"
          }}
        />
      </Show>
    </div>
  );
};

const EntryViewer = (props) => {
  const example = () => props.example;
  const [editingField, setEditingField] = createSignal(null);

  const handleEdit = (field) => {
    if (editingField() === field) {
      setEditingField(null);
      props.onUpdate({ ...example() });
    } else {
      setEditingField(field);
    }
  };

  const handleChange = (field, value) => {
    const newExample = { ...example(), [field]: value };
    props.onUpdate(newExample);
  };

  return (
    <div class="entry-viewer">
      <Show when={example()} fallback={<div class="empty-state">Select a dataset and entry to view</div>}>
        <div class="entry-header">
          <h3>Example {props.index + 1}</h3>
          <div class="entry-controls">
            <button onClick={props.onPrev} disabled={props.index <= 0}>Previous</button>
            <button onClick={props.onNext} disabled={!props.hasNext}>Next</button>
          </div>
        </div>

        <div class="entry-content">
          <div class="label-actions" style={{ "margin-bottom": "1rem", display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => props.onLabel(true)}
              class={example().label === true ? 'active positive' : ''}
              style={{
                "background-color": example().label === true ? "rgba(16, 185, 129, 0.2)" : "#1f2937",
                color: example().label === true ? "#34d399" : "#9ca3af",
                border: "1px solid #374151",
                padding: "0.5rem 1rem",
                "border-radius": "0.375rem",
                cursor: "pointer"
              }}
            >
              👍 Positive
            </button>
            <button
              onClick={() => props.onLabel(false)}
              class={example().label === false ? 'active negative' : ''}
              style={{
                "background-color": example().label === false ? "rgba(239, 68, 68, 0.2)" : "#1f2937",
                color: example().label === false ? "#f87171" : "#9ca3af",
                border: "1px solid #374151",
                padding: "0.5rem 1rem",
                "border-radius": "0.375rem",
                cursor: "pointer"
              }}
            >
              👎 Negative
            </button>
          </div>

          <Show when={example().label !== undefined}>
          </Show>

          <div class="comparison-view" style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "1rem" }}>
            <Show when={example().prompt}>
              <div class="comparison-column">
                <CodeBlock
                  label="Prompt"
                  code={example().prompt}
                  language={example().metadata?.language}
                  editing={editingField() === 'prompt'}
                  onEdit={() => handleEdit('prompt')}
                  onChange={(val) => handleChange('prompt', val)}
                />
              </div>
            </Show>

            <Show when={example().completion}>
              <div class="comparison-column">
                <CodeBlock
                  label="Completion"
                  code={example().completion}
                  language={example().metadata?.language}
                  editing={editingField() === 'completion'}
                  onEdit={() => handleEdit('completion')}
                  onChange={(val) => handleChange('completion', val)}
                />
              </div>
            </Show>
          </div>

          <Show when={example().chosen}>
            <CodeBlock label="Chosen" code={example().chosen} language={example().metadata?.language} />
          </Show>

          <Show when={example().rejected}>
            <CodeBlock label="Rejected" code={example().rejected} language={example().metadata?.language} />
          </Show>

          <Show when={example().metadata}>
            <div class="metadata">
              <h4>Metadata</h4>
              <pre>{JSON.stringify(example().metadata, null, 2)}</pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default EntryViewer;
