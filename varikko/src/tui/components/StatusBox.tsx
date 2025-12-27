import React from 'react';
import { Box, Text } from 'ink';
import { symbols } from '../theme';

interface DBStats {
  zones: number;
  routes: {
    total: number;
    ok: number;
    pending: number;
    no_route: number;
    error: number;
  };
  deciles: {
    calculated: boolean;
    count: number;
  };
  lastRun: any;
}

interface StatusBoxProps {
  stats: DBStats;
}

export function StatusBox({ stats }: StatusBoxProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>Database: </Text>
        <Text color="cyan">/Users/teemu/Documents/Kantama/opas/public/varikko.db</Text>
      </Box>
      <Box>
        <Text>Zones: </Text>
        <Text color="green">{stats.zones}</Text>
        <Text> | Routes: </Text>
        <Text color="cyan">{stats.routes.total.toLocaleString()}</Text>
        <Text color="gray"> (</Text>
        <Text color="green">OK: {stats.routes.ok.toLocaleString()}</Text>
        <Text color="gray">, </Text>
        <Text color="yellow">PENDING: {stats.routes.pending.toLocaleString()}</Text>
        <Text color="gray">, </Text>
        <Text color="red">ERROR: {stats.routes.error.toLocaleString()}</Text>
        <Text color="gray">)</Text>
      </Box>
      <Box>
        <Text>Deciles: </Text>
        {stats.deciles.calculated ? (
          <Text color="green">{symbols.success} Calculated</Text>
        ) : (
          <Text color="gray">Not calculated</Text>
        )}
      </Box>
    </Box>
  );
}
