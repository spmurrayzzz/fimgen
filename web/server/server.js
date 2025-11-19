const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const app = express();
const PORT = process.env.PORT || 3001;
const DATASET_DIR = path.resolve(__dirname, '../../dataset');

app.use(cors());
app.use(bodyParser.json());

async function readJsonl(filePath, page = 1, pageSize = 10) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const items = [];
  let lineCount = 0;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  for await (const line of rl) {
    if (lineCount >= start && lineCount < end) {
      try {
        items.push(JSON.parse(line));
      } catch (e) {
        console.error('Error parsing line:', e);
        items.push({ error: 'Invalid JSON', raw: line });
      }
    }
    lineCount++;
    if (lineCount >= end) {
      rl.close();
      break;
    }
  }

  return { items, total: lineCount };
}

async function countLines(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  let count = 0;
  for await (const line of rl) {
    count++;
  }
  return count;
}

app.get('/api/datasets', (req, res) => {
  try {
    if (!fs.existsSync(DATASET_DIR)) {
      return res.status(404).json({ error: 'Dataset directory not found' });
    }
    const files = fs.readdirSync(DATASET_DIR).filter(f => f.endsWith('.jsonl'));
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/datasets/:filename', async (req, res) => {
  const { filename } = req.params;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const filePath = path.join(DATASET_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const total = await countLines(filePath);
    const { items } = await readJsonl(filePath, page, pageSize);
    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/datasets/:filename/entry/:index', async (req, res) => {
  const { filename, index } = req.params;
  const { entry } = req.body;
  const filePath = path.join(DATASET_DIR, filename);
  const idx = parseInt(index);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (idx < 0 || idx >= lines.length) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    lines[idx] = JSON.stringify(entry);

    fs.writeFileSync(filePath, lines.join('\n') + '\n');

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
