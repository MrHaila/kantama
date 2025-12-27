import React from 'react';
import { Box, Text } from 'ink';
import { drawBoxBorder } from '../theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  width?: number;
}

export function Header({ title, subtitle, width = 80 }: HeaderProps) {
  return (
    <Box flexDirection="column">
      <Text>{drawBoxBorder(width, 'top')}</Text>
      <Box>
        <Text>│ </Text>
        <Text color="cyan" bold>{title}</Text>
        {subtitle && (
          <>
            <Text> - </Text>
            <Text color="gray">{subtitle}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
