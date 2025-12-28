import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Database from 'better-sqlite3';
import { calculateTimeBuckets, TimeBucket } from '../../lib/time-buckets.js';
import { ProgressEmitter, ProgressEvent } from '../../lib/events.js';
import { Header } from '../components/Header.js';
import { Footer } from '../components/Footer.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { Spinner } from '../components/Spinner.js';
import { symbols } from '../theme.js';

interface TimeBucketsScreenProps {
  dbPath: string;
  force?: boolean;
  onExit: (error?: Error) => void;
}

type Status = 'idle' | 'running' | 'complete' | 'error';

export default function TimeBucketsScreen({ dbPath, force = false, onExit }: TimeBucketsScreenProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(8);
  const [message, setMessage] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [timeBuckets, setTimeBuckets] = useState<TimeBucket[] | null>(null);

  useEffect(() => {
    let db: Database.Database | null = null;

    const run = async () => {
      try {
        setStatus('running');
        db = new Database(dbPath);

        const emitter = new ProgressEmitter();

        emitter.on('progress', (event: ProgressEvent) => {
          if (event.type === 'start') {
            setMessage(event.message || 'Starting...');
            setTotal(event.total || 8);
          } else if (event.type === 'progress') {
            setProgress(event.current || 0);
            setTotal(event.total || 8);
            setMessage(event.message || 'Processing...');
          } else if (event.type === 'complete') {
            setProgress(event.total || 8);
            setMessage(event.message || 'Complete!');
            setStatus('complete');
          } else if (event.type === 'error') {
            setError(event.error?.message || 'Unknown error');
            setStatus('error');
          }
        });

        const result = calculateTimeBuckets(db, { force, emitter });
        setTimeBuckets(result.timeBuckets);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setStatus('error');
      } finally {
        if (db) {
          db.close();
        }

        // Auto-exit after completion or error
        setTimeout(() => {
          if (status === 'complete') {
            onExit();
          } else if (status === 'error') {
            onExit(error ? new Error(error) : undefined);
          }
        }, 2000);
      }
    };

    run();
  }, [dbPath, force]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Calculate Time Buckets" />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {status === 'running' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Spinner />
              <Text> {message}</Text>
            </Box>

            <ProgressBar current={progress} total={total} />
          </Box>
        )}

        {status === 'complete' && timeBuckets && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color="green">
                {symbols.success} {message}
              </Text>
            </Box>

            <Box marginBottom={1}>
              <Text bold>Time Bucket Distribution:</Text>
            </Box>

            {timeBuckets.map((bucket) => (
              <Box key={bucket.number} marginLeft={2}>
                <Text>
                  Bucket {bucket.number}: {bucket.label} ({bucket.color})
                </Text>
              </Box>
            ))}

            <Box marginTop={1}>
              <Text dimColor>Time buckets calculated successfully and stored in database.</Text>
            </Box>
          </Box>
        )}

        {status === 'error' && (
          <Box flexDirection="column">
            <Box>
              <Text color="red">
                {symbols.error} Error: {error}
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      <Footer
        shortcuts={[
          { key: 'q', label: 'Quit' },
          { key: 'Esc', label: 'Back' },
        ]}
      />
    </Box>
  );
}
