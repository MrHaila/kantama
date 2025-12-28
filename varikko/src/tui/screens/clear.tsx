import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type Database from 'better-sqlite3';
import { Header } from '../components/Header.js';
import { Footer } from '../components/Footer.js';
import { Spinner } from '../components/Spinner.js';
import { colors, symbols } from '../theme.js';
import { clearData, getCounts, type ClearOptions } from '../../lib/clearing.js';
import { ProgressEmitter } from '../../lib/events.js';

interface ClearScreenProps {
  db: Database.Database;
  options: ClearOptions;
}

interface Status {
  state: 'idle' | 'running' | 'complete' | 'error';
  message?: string;
  deleted?: {
    routes?: number;
    places?: number;
    metadata?: number;
    timeBuckets?: number;
  };
}

export const ClearScreen: React.FC<ClearScreenProps> = ({ db, options }) => {
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [counts, setCounts] = useState<{
    routes: number;
    places: number;
    metadata: number;
    timeBuckets: number;
  } | null>(null);

  useEffect(() => {
    // Get initial counts
    try {
      const initialCounts = getCounts(db);
      setCounts(initialCounts);
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to get counts',
      });
    }
  }, [db]);

  useEffect(() => {
    if (status.state !== 'idle') return;

    const emitter = new ProgressEmitter();

    emitter.on('progress', (event) => {
      if (event.type === 'start') {
        setStatus({ state: 'running' });
      } else if (event.type === 'progress') {
        setStatus({ state: 'running', message: event.message });
      } else if (event.type === 'complete') {
        setStatus({
          state: 'complete',
          message: event.message,
          deleted: event.metadata as Status['deleted'],
        });
      } else if (event.type === 'error') {
        setStatus({ state: 'error', message: event.message });
      }
    });

    // Start clearing
    try {
      clearData(db, { ...options, emitter });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to clear data',
      });
    }
  }, [db, options, status.state]);

  // Determine what will be cleared
  const { routes, places, metadata, timeBuckets } = options;
  const clearAll = !routes && !places && !metadata && !timeBuckets;

  const getTargetDescription = (): string => {
    if (clearAll) return 'ALL data (routes, places, metadata, time_buckets)';

    const targets = [];
    if (routes) targets.push('routes (reset to PENDING)');
    if (places) targets.push('places and routes');
    if (metadata) targets.push('metadata');
    if (timeBuckets) targets.push('time_buckets');

    return targets.join(', ');
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Clear Data" />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {/* Current counts */}
        {counts && status.state === 'idle' && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Current database state:</Text>
            <Box marginLeft={2} flexDirection="column">
              <Text>
                Places: <Text color="cyan">{counts.places.toLocaleString()}</Text>
              </Text>
              <Text>
                Routes: <Text color="cyan">{counts.routes.toLocaleString()}</Text>
              </Text>
              <Text>
                Metadata: <Text color="cyan">{counts.metadata.toLocaleString()}</Text>
              </Text>
              <Text>
                Time Buckets: <Text color="cyan">{counts.timeBuckets.toLocaleString()}</Text>
              </Text>
            </Box>
          </Box>
        )}

        {/* Target description */}
        <Box marginBottom={1}>
          <Text>
            Target: <Text bold>{getTargetDescription()}</Text>
          </Text>
        </Box>

        {/* Status display */}
        {status.state === 'running' && (
          <Box>
            <Spinner />
            <Text> {status.message || 'Clearing data...'}</Text>
          </Box>
        )}

        {status.state === 'complete' && (
          <Box flexDirection="column">
            <Text color="green">
              {symbols.success} {status.message}
            </Text>

            {status.deleted && (
              <Box marginTop={1} marginLeft={2} flexDirection="column">
                <Text bold>Deleted records:</Text>
                {status.deleted.places !== undefined && (
                  <Text>
                    Places: <Text color="green">{status.deleted.places.toLocaleString()}</Text>
                  </Text>
                )}
                {status.deleted.routes !== undefined && (
                  <Text>
                    Routes: <Text color="green">{status.deleted.routes.toLocaleString()}</Text>
                    {routes && !places && ' (reset to PENDING)'}
                  </Text>
                )}
                {status.deleted.metadata !== undefined && (
                  <Text>
                    Metadata: <Text color="green">{status.deleted.metadata.toLocaleString()}</Text>
                  </Text>
                )}
                {status.deleted.timeBuckets !== undefined && (
                  <Text>
                    Time Buckets: <Text color="green">{status.deleted.timeBuckets.toLocaleString()}</Text>
                  </Text>
                )}
              </Box>
            )}
          </Box>
        )}

        {status.state === 'error' && (
          <Box>
            <Text color="red">
              {symbols.error} Error: {status.message}
            </Text>
          </Box>
        )}
      </Box>

      <Footer shortcuts={[{ key: 'q', label: 'Quit' }]} />
    </Box>
  );
};
