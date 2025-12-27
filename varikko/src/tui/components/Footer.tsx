import React from 'react';
import { Box, Text } from 'ink';

interface FooterProps {
  shortcuts: Array<{ key: string; label: string }>;
  width?: number;
}

export function Footer({ shortcuts, width = 80 }: FooterProps) {
  return (
    <Box marginTop={1}>
      {shortcuts.map((shortcut, idx) => (
        <React.Fragment key={shortcut.key}>
          {idx > 0 && <Text> | </Text>}
          <Text color="cyan">[{shortcut.key}]</Text>
          <Text> {shortcut.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
