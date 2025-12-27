import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { StatusBox } from './components/StatusBox';
import { openDB, getDBStats } from '../lib/db';

export function App() {
  const { exit } = useApp();
  const [stats, setStats] = useState(() => {
    const db = openDB();
    const s = getDBStats(db);
    db.close();
    return s;
  });

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
    }

    // Refresh stats on 'r'
    if (input === 'r') {
      const db = openDB();
      setStats(getDBStats(db));
      db.close();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="VARIKKO DATA PIPELINE" width={80} />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <StatusBox stats={stats} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">
          TUI Interface Coming Soon!
        </Text>
        <Box marginTop={1}>
          <Text color="gray">
            This is a placeholder. Full dashboard and workflow screens will be implemented in later phases.
          </Text>
        </Box>
        <Text color="gray">
          Press 'r' to refresh stats, or 'q' to quit.
        </Text>
      </Box>

      <Footer
        shortcuts={[
          { key: 'r', label: 'Refresh' },
          { key: 'q', label: 'Quit' },
        ]}
      />
    </Box>
  );
}
