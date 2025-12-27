import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ProgressBar } from '../components/ProgressBar';
import { Spinner } from '../components/Spinner';
import { openDB } from '../../lib/db';
import { fetchZonesMultiCity } from '../../lib/zones';
import { createProgressEmitter, type ProgressEvent } from '../../lib/events';
import { symbols } from '../theme';

interface FetchZonesScreenProps {
  testMode: boolean;
  onComplete: () => void;
  onCancel: () => void;
}

export function FetchZonesScreen({ testMode, onComplete, onCancel }: FetchZonesScreenProps) {
  const { exit } = useApp();
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<{ zoneCount: number; routeCount: number } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useInput((input, key) => {
    if (status === 'complete' || status === 'error') {
      if (key.return) {
        onComplete();
      } else if (key.escape) {
        onCancel();
      }
    }
  });

  useEffect(() => {
    if (status !== 'idle') return;

    const run = async () => {
      setStatus('running');

      const db = openDB();
      const emitter = createProgressEmitter();

      emitter.on('progress', (event) => {
        setProgress(event);
      });

      try {
        const result = await fetchZonesMultiCity(db, {
          testMode,
          testLimit: 5,
          emitter,
        });

        setResult(result);
        setStatus('complete');
      } catch (err) {
        setError(err as Error);
        setStatus('error');
      } finally {
        db.close();
      }
    };

    run();
  }, [status, testMode]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="FETCH ZONES"
        subtitle={testMode ? 'Test Mode (5 zones)' : 'Full Run'}
        width={80}
      />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {status === 'running' && (
          <>
            {progress && (
              <>
                {progress.type === 'start' && (
                  <Box>
                    <Spinner label={progress.message || 'Starting...'} />
                  </Box>
                )}

                {progress.type === 'progress' && progress.current !== undefined && progress.total !== undefined && (
                  <ProgressBar
                    current={progress.current}
                    total={progress.total}
                    label={progress.message || 'Processing...'}
                  />
                )}
              </>
            )}
          </>
        )}

        {status === 'complete' && result && (
          <Box flexDirection="column">
            <Text color="green">
              {symbols.success} Zones fetched successfully!
            </Text>
            <Box marginTop={1}>
              <Text>Zones: </Text>
              <Text color="cyan">{result.zoneCount || 0}</Text>
            </Box>
            <Box>
              <Text>Routes: </Text>
              <Text color="cyan">{(result.routeCount || 0).toLocaleString()}</Text>
              <Text color="gray"> (Cartesian product pre-filled)</Text>
            </Box>
            <Box>
              <Text color="gray">
                Helsinki (osa-alue), Vantaa (kaupunginosa), Espoo (statistical areas)
              </Text>
            </Box>
          </Box>
        )}

        {status === 'error' && error && (
          <Box flexDirection="column">
            <Text color="red">
              {symbols.error} Error fetching zones
            </Text>
            <Box marginTop={1}>
              <Text color="gray">{error.message}</Text>
            </Box>
          </Box>
        )}
      </Box>

      <Footer
        shortcuts={
          status === 'complete' || status === 'error'
            ? [{ key: 'Enter', label: 'Continue' }]
            : []
        }
      />
    </Box>
  );
}
