import React from 'react';
import { Box, Text } from 'ink';

interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
  label?: string;
}

export function ProgressBar({ current, total, width = 40, label }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (current / total) * 100));
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <Box flexDirection="column">
      {label && <Text>{label}</Text>}
      <Box>
        <Text color="cyan">{bar}</Text>
        <Text> {current.toLocaleString()}/{total.toLocaleString()}</Text>
        <Text color="gray"> ({percentage.toFixed(1)}%)</Text>
      </Box>
    </Box>
  );
}
