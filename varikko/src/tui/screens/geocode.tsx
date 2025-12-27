import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ProgressBar } from '../components/ProgressBar';
import { Spinner } from '../components/Spinner';
import { openDB } from '../../lib/db';
import { geocodeZones } from '../../lib/geocoding';
import { createProgressEmitter, type ProgressEvent } from '../../lib/events';
import { symbols } from '../theme';

interface GeocodeScreenProps {
  testMode: boolean;
  apiKey?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function GeocodeScreen({ testMode, apiKey, onComplete, onCancel }: GeocodeScreenProps) {
  const { exit } = useApp();
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<{ success: number; failed: number; errors: Array<{ id: string; error: string }> } | null>(null);
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
        const result = await geocodeZones(db, {
          testMode,
          testLimit: 5,
          apiKey,
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
  }, [status, testMode, apiKey]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="GEOCODE ZONES"
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
                    <Spinner label={progress.message || 'Starting geocoding...'} />
                  </Box>
                )}

                {progress.type === 'progress' && progress.current && progress.total && (
                  <ProgressBar
                    current={progress.current}
                    total={progress.total}
                    label={progress.message || 'Geocoding zones...'}
                  />
                )}
              </>
            )}
          </>
        )}

        {status === 'complete' && result && (
          <Box flexDirection="column">
            <Text color="green">
              {symbols.success} Geocoding complete!
            </Text>
            <Box marginTop={1}>
              <Text>Successfully geocoded: </Text>
              <Text color="green">{result.success}</Text>
              <Text> zones</Text>
            </Box>
            <Box>
              <Text>Failed (fallback to geometric): </Text>
              <Text color="yellow">{result.failed}</Text>
              <Text> zones</Text>
            </Box>
            {result.errors.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color="gray">Sample errors (first 3):</Text>
                {result.errors.slice(0, 3).map((err) => (
                  <Text key={err.id} color="gray">
                    {'  '}• {err.id}: {err.error}
                  </Text>
                ))}
              </Box>
            )}
            {!apiKey && (
              <Box marginTop={1}>
                <Text color="yellow">⚠️  No API key configured (set DIGITRANSIT_API_KEY or HSL_API_KEY)</Text>
              </Box>
            )}
          </Box>
        )}

        {status === 'error' && error && (
          <Box flexDirection="column">
            <Text color="red">
              {symbols.error} Error geocoding zones
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
