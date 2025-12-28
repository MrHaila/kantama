import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { StatusBox } from './components/StatusBox';
import { openDB, getDBStats, type DBStats } from '../lib/db';
import { symbols, box } from './theme';

export type Screen =
  | 'dashboard'
  | 'fetch-zones'
  | 'geocode'
  | 'routes'
  | 'clear'
  | 'time-buckets'
  | 'maps'
  | 'help';

interface DashboardProps {
  onNavigate: (screen: Screen) => void;
  onQuit: () => void;
  testMode: boolean;
  onToggleTestMode: () => void;
}

interface Stage {
  key: string;
  label: string;
  description: string;
  screen: Screen;
}

const stages: Stage[] = [
  { key: '1', label: 'Fetch Zones', description: 'Fetch multi-city administrative zones', screen: 'fetch-zones' },
  { key: '2', label: 'Geocode Zones', description: 'Resolve routing addresses', screen: 'geocode' },
  { key: '3', label: 'Build Routes', description: 'Calculate transit routes', screen: 'routes' },
  { key: '4', label: 'Clear Data', description: 'Reset or clear database', screen: 'clear' },
  { key: '5', label: 'Calculate Time Buckets', description: 'Generate heatmap buckets', screen: 'time-buckets' },
  { key: '6', label: 'Process Map', description: 'Convert shapefiles to TopoJSON', screen: 'maps' },
];

export function Dashboard({ onNavigate, onQuit, testMode, onToggleTestMode }: DashboardProps) {
  const [stats, setStats] = useState<DBStats | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const refreshStats = () => {
    try {
      const db = openDB();
      const s = getDBStats(db);
      setStats(s);
      db.close();
    } catch (error) {
      // Handle error silently for now
    }
  };

  useEffect(() => {
    refreshStats();
  }, []);

  useInput((input, key) => {
    // Quit
    if (input === 'q') {
      onQuit();
      return;
    }

    // Refresh stats
    if (input === 'r') {
      refreshStats();
      return;
    }

    // Toggle test mode
    if (input === 't') {
      onToggleTestMode();
      return;
    }

    // Help
    if (input === '?') {
      onNavigate('help');
      return;
    }

    // Navigate by number key
    const stageIndex = stages.findIndex((s) => s.key === input);
    if (stageIndex !== -1) {
      onNavigate(stages[stageIndex].screen);
      return;
    }

    // Arrow navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(stages.length - 1, prev + 1));
      return;
    }

    // Enter to navigate to selected stage
    if (key.return) {
      onNavigate(stages[selectedIndex].screen);
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="VARIKKO DATA PIPELINE" width={80} />

      {/* Status Box */}
      {stats && (
        <Box flexDirection="column" marginTop={1}>
          <StatusBox stats={stats} />
        </Box>
      )}

      {/* Separator */}
      <Box marginTop={1}>
        <Text>{box.verticalRight}{box.horizontal.repeat(78)}{box.verticalLeft}</Text>
      </Box>

      {/* Workflow Stages */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>WORKFLOW STAGES</Text>
        <Box marginTop={1} flexDirection="column">
          {stages.map((stage, index) => (
            <Box key={stage.key}>
              <Text color={index === selectedIndex ? 'magenta' : 'gray'}>
                {index === selectedIndex ? symbols.arrow : ' '}{' '}
              </Text>
              <Text color="cyan">[{stage.key}]</Text>
              <Text> </Text>
              <Text bold={index === selectedIndex}>{stage.label}</Text>
              <Text color="gray"> - {stage.description}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Separator */}
      <Box marginTop={1}>
        <Text>{box.verticalRight}{box.horizontal.repeat(78)}{box.verticalLeft}</Text>
      </Box>

      {/* Info */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">
          Use number keys [1-6] to select a stage, or arrow keys + Enter
        </Text>
      </Box>

      {/* Footer */}
      <Footer
        shortcuts={[
          { key: 't', label: `Test Mode: ${testMode ? 'ON' : 'OFF'}` },
          { key: 'r', label: 'Refresh' },
          { key: '?', label: 'Help' },
          { key: 'q', label: 'Quit' },
        ]}
      />
    </Box>
  );
}
