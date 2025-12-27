import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Database from 'better-sqlite3';
import { buildRoutes, BuildRoutesOptions, getOTPConfig } from '../../lib/routing';
import { ProgressEmitter, type ProgressEvent } from '../../lib/events';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ProgressBar } from '../components/ProgressBar';
import { Spinner } from '../components/Spinner';

interface RoutesScreenProps {
  db: Database.Database;
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  testMode?: boolean;
  onExit: () => void;
}

type ScreenStatus = 'idle' | 'running' | 'complete' | 'error';

export default function RoutesScreen({ db, period, testMode = false, onExit }: RoutesScreenProps) {
  const [status, setStatus] = useState<ScreenStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [stats, setStats] = useState({ ok: 0, noRoute: 0, errors: 0 });
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{ isLocal: boolean; concurrency: number } | null>(null);

  useEffect(() => {
    const emitter = new ProgressEmitter();

    emitter.on('progress', (event: ProgressEvent) => {
      if (event.type === 'start') {
        setStatus('running');
        setConfig({
          isLocal: event.metadata?.isLocal || false,
          concurrency: event.metadata?.concurrency || 1,
        });
      } else if (event.type === 'progress') {
        setProgress(event.current || 0);
        setTotal(event.total || 0);
        if (event.metadata) {
          setCurrentPeriod(event.metadata.period || '');
          setStats({
            ok: event.metadata.ok || 0,
            noRoute: event.metadata.noRoute || 0,
            errors: event.metadata.errors || 0,
          });
        }
      } else if (event.type === 'complete') {
        setStatus('complete');
      } else if (event.type === 'error') {
        setStatus('error');
        setError(event.error?.message || 'Unknown error');
      }
    });

    const options: BuildRoutesOptions = {
      period,
      testMode,
      testLimit: 5,
      emitter,
    };

    buildRoutes(db, options).catch((err) => {
      setStatus('error');
      setError(err.message);
    });
  }, [db, period, testMode]);

  const getStatusMessage = (): string => {
    switch (status) {
      case 'idle':
        return 'Initializing...';
      case 'running':
        return `Building routes${currentPeriod ? ` (${currentPeriod})` : ''}...`;
      case 'complete':
        return 'Route calculation complete!';
      case 'error':
        return 'Route calculation failed';
    }
  };

  const getStatusColor = (): string => {
    switch (status) {
      case 'idle':
        return 'gray';
      case 'running':
        return 'cyan';
      case 'complete':
        return 'green';
      case 'error':
        return 'red';
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Build Routes" />

      <Box marginTop={1}>
        <Text color={getStatusColor()}>{getStatusMessage()}</Text>
      </Box>

      {config && (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">
            OTP: {config.isLocal ? 'Local (localhost:9080)' : 'Remote (Digitransit API)'}
          </Text>
          <Text color="gray">Concurrency: {config.concurrency} requests</Text>
          {period && <Text color="gray">Period: {period}</Text>}
          {testMode && <Text color="yellow">⚠ Test mode: Processing 5 random routes</Text>}
        </Box>
      )}

      {!config?.isLocal && (
        <Box marginTop={1}>
          <Text color="yellow">
            ⚠ Using remote API - this will be slow. Consider using local OTP for faster processing.
          </Text>
        </Box>
      )}

      {status === 'running' && (
        <Box marginTop={1} flexDirection="column">
          <ProgressBar current={progress} total={total} />
          <Box marginTop={1}>
            <Spinner label="Processing routes..." />
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color="green">✓ OK: {stats.ok}</Text>
            <Text color="yellow">⊘ No Route: {stats.noRoute}</Text>
            <Text color="red">✗ Errors: {stats.errors}</Text>
          </Box>
        </Box>
      )}

      {status === 'complete' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">✓ Routes processed: {progress}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="green">  ✓ Successful: {stats.ok}</Text>
            <Text color="yellow">  ⊘ No route found: {stats.noRoute}</Text>
            <Text color="red">  ✗ Errors: {stats.errors}</Text>
          </Box>
          {stats.ok > 0 && (
            <Box marginTop={1}>
              <Text color="gray">
                Next: Run <Text color="cyan">varikko deciles</Text> to calculate heatmap data
              </Text>
            </Box>
          )}
        </Box>
      )}

      {status === 'error' && error && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">Error: {error}</Text>
          <Box marginTop={1}>
            <Text color="gray">
              Check logs for details. Ensure OTP server is running if using local mode.
            </Text>
          </Box>
        </Box>
      )}

      <Footer
        shortcuts={[
          { key: 'q', label: 'Quit' },
          { key: 'Esc', label: 'Back' },
        ]}
      />
    </Box>
  );
}
