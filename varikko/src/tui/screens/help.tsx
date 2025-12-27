import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { box } from '../theme';

interface HelpScreenProps {
  onBack: () => void;
}

export function HelpScreen({ onBack }: HelpScreenProps) {
  useInput((input, key) => {
    if (input === 'q' || key.escape || key.return) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="HELP" width={80} />

      <Box flexDirection="column" marginTop={1}>
        {/* Global Shortcuts */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">GLOBAL SHORTCUTS</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text><Text color="cyan">1-6</Text> - Select workflow stage</Text>
            <Text><Text color="cyan">↑/↓ or j/k</Text> - Navigate menu</Text>
            <Text><Text color="cyan">Enter</Text> - Confirm selection</Text>
            <Text><Text color="cyan">Esc</Text> - Back to dashboard</Text>
            <Text><Text color="cyan">q</Text> - Quit application</Text>
            <Text><Text color="cyan">r</Text> - Refresh database stats</Text>
            <Text><Text color="cyan">t</Text> - Toggle test mode</Text>
            <Text><Text color="cyan">?</Text> - Show this help screen</Text>
          </Box>
        </Box>

        {/* Separator */}
        <Box marginBottom={1}>
          <Text>{box.horizontal.repeat(78)}</Text>
        </Box>

        {/* Workflow Stages */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">WORKFLOW STAGES</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text><Text color="cyan">[1] Fetch Zones</Text> - Download postal code polygons from WFS</Text>
            <Text color="gray">    Creates zone geometry, centroids, and pre-fills route skeleton</Text>

            <Box marginTop={1}>
              <Text><Text color="cyan">[2] Geocode Zones</Text> - Resolve street addresses for routing</Text>
            </Box>
            <Text color="gray">    Enhances routing accuracy (optional step)</Text>

            <Box marginTop={1}>
              <Text><Text color="cyan">[3] Build Routes</Text> - Calculate transit routes via OTP</Text>
            </Box>
            <Text color="gray">    Calculates routes for 3 time periods (morning, evening, midnight)</Text>

            <Box marginTop={1}>
              <Text><Text color="cyan">[4] Clear Data</Text> - Reset or clear database</Text>
            </Box>
            <Text color="gray">    Selective clearing: routes, places, metadata, or deciles</Text>

            <Box marginTop={1}>
              <Text><Text color="cyan">[5] Calculate Deciles</Text> - Generate heatmap distribution</Text>
            </Box>
            <Text color="gray">    Creates 10-bucket color distribution for visualization</Text>

            <Box marginTop={1}>
              <Text><Text color="cyan">[6] Process Map</Text> - Convert shapefiles to TopoJSON/SVG</Text>
            </Box>
            <Text color="gray">    Generates background map layers (water, roads)</Text>
          </Box>
        </Box>

        {/* Separator */}
        <Box marginBottom={1}>
          <Text>{box.horizontal.repeat(78)}</Text>
        </Box>

        {/* Test Mode */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">TEST MODE</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>When enabled, workflows process limited data for testing:</Text>
            <Text color="gray">• Fetch Zones: 5 zones instead of all</Text>
            <Text color="gray">• Build Routes: 10 routes instead of cartesian product</Text>
            <Text color="gray">• Other workflows: Use existing test data</Text>
          </Box>
        </Box>

        {/* Separator */}
        <Box marginBottom={1}>
          <Text>{box.horizontal.repeat(78)}</Text>
        </Box>

        {/* Tips */}
        <Box flexDirection="column">
          <Text bold color="cyan">TIPS</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>• Run workflows in order: Fetch → Geocode → Routes → Deciles</Text>
            <Text>• Use test mode first to verify configuration</Text>
            <Text>• Clear data if you need to start over</Text>
            <Text>• Stats refresh automatically after each workflow</Text>
          </Box>
        </Box>
      </Box>

      <Footer shortcuts={[{ key: 'Esc/Enter', label: 'Back to Dashboard' }]} />
    </Box>
  );
}
