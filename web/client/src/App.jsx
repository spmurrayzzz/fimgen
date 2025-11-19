import { createSignal } from 'solid-js';
import axios from 'axios';
import DatasetList from './components/DatasetList';
import EntryViewer from './components/EntryViewer';
import './index.css';

function App() {
  const [selectedDataset, setSelectedDataset] = createSignal(null);
  const [currentEntry, setCurrentEntry] = createSignal(null);
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [totalEntries, setTotalEntries] = createSignal(0);
  const [loadingEntry, setLoadingEntry] = createSignal(false);

  const loadEntry = async (dataset, index) => {
    if (!dataset) return;
    setLoadingEntry(true);
    try {
      const response = await axios.get(`/api/datasets/${dataset}?page=${index + 1}&pageSize=1`);
      if (response.data.items && response.data.items.length > 0) {
        setCurrentEntry(response.data.items[0]);
        setTotalEntries(response.data.total);
      } else {
        setCurrentEntry(null);
      }
    } catch (err) {
      console.error('Failed to load entry', err);
    } finally {
      setLoadingEntry(false);
    }
  };

  const handleSelectDataset = (dataset) => {
    setSelectedDataset(dataset);
    setCurrentIndex(0);
    loadEntry(dataset, 0);
  };

  const handleNext = () => {
    const nextIndex = currentIndex() + 1;
    setCurrentIndex(nextIndex);
    loadEntry(selectedDataset(), nextIndex);
  };

  const handlePrev = () => {
    if (currentIndex() > 0) {
      const prevIndex = currentIndex() - 1;
      setCurrentIndex(prevIndex);
      loadEntry(selectedDataset(), prevIndex);
    }
  };

  const handleLabel = async (label) => {
    if (!currentEntry() || !selectedDataset()) return;

    const updatedEntry = { ...currentEntry(), label };
    handleUpdate(updatedEntry);
  };

  const handleUpdate = async (updatedEntry) => {
    if (!selectedDataset()) return;

    setCurrentEntry(updatedEntry);

    try {
      await axios.post(`/api/datasets/${selectedDataset()}/entry/${currentIndex()}`, {
        entry: updatedEntry
      });
    } catch (err) {
      console.error('Failed to save entry', err);
    }
  };

  return (
    <div class="app-container">
      <DatasetList onSelect={handleSelectDataset} selectedDataset={selectedDataset()} />
      <div class="main-content">
        <EntryViewer
          example={currentEntry()}
          index={currentIndex()}
          onNext={handleNext}
          onPrev={handlePrev}
          onLabel={handleLabel}
          onUpdate={handleUpdate}
          hasNext={currentIndex() < totalEntries() - 1}
        />
      </div>
    </div>
  );
}

export default App;
