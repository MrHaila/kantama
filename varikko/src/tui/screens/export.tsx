import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Database from 'better-sqlite3';
import { exportRoutes, getExportStats, ExportResult } from '../../lib/export.js';
import { ProgressEmitter, ProgressEvent } from '../../lib/events.js';
import { Header } from '../components/Header.js';
import { Footer } from '../components/Footer.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { Spinner } from '../components/Spinner.js';
import { symbols } from '../theme.js';

interface ExportScreenProps {
  dbPath: string;
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  outputPath?: string;
  onExit: (error?: Error) => void;
}

type Status = 'idle' | 'running' | 'complete' | 'error';

export default function ExportScreen({
  dbPath,
  period,
  outputPath,
  onExit,
}: ExportScreenProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(2);
  const [message, setMessage] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [previewStats, setPreviewStats] = useState<{
    routeCount: number;
    originCount: number;
  } | null>(null);

  useEffect(() => {
    let db: Database.Database | null = null;

    const run = async () => {
      try {
        setStatus('running');
        db = new Database(dbPath);

        // Get preview stats before export
        const stats = getExportStats(db, period);
        setPreviewStats(stats);

        const emitter = new ProgressEmitter();

        emitter.on('progress', (event: ProgressEvent) => {
          if (event.type === 'start') {
            setMessage(event.message || 'Starting...');
            setTotal(event.total || 2);
          } else if (event.type === 'progress') {
            setProgress(event.current || 0);
            setTotal(event.total || 2);
            setMessage(event.message || 'Processing...');
          } else if (event.type === 'complete') {
            setProgress(event.total || 2);
            setMessage(event.message || 'Complete!');
            setStatus('complete');
          } else if (event.type === 'error') {
            setError(event.error?.message || 'Unknown error');
            setStatus('error');
          }
        });

        const exportResult = exportRoutes(db, { period, outputPath, emitter });
        setResult(exportResult);
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
  }, [dbPath, period, outputPath]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Export Routes" />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {status === 'running' && (
          <Box flexDirection="column">
            {previewStats && (
              <Box marginBottom={1}>
                <Text dimColor>
                  Exporting {previewStats.routeCount} routes from {previewStats.originCount}{' '}
                  origins
                  {period && ` (${period} period)`}...
                </Text>
              </Box>
            )}

            <Box marginBottom={1}>
              <Spinner />
              <Text> {message}</Text>
            </Box>

            <ProgressBar current={progress} total={total} />
          </Box>
        )}

        {status === 'complete' && result && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color="green">
                {symbols.success} {message}
              </Text>
            </Box>

            <Box flexDirection="column" marginLeft={2} marginBottom={1}>
              <Text>
                <Text bold>Routes:</Text> {result.routeCount}
              </Text>
              <Text>
                <Text bold>Origins:</Text> {result.originCount}
              </Text>
              {period && (
                <Text>
                  <Text bold>Period:</Text> {period}
                </Text>
              )}
              <Text>
                <Text bold>Output:</Text> {result.outputPath}
              </Text>
              <Text>
                <Text bold>File size:</Text> {formatFileSize(result.fileSize)}
              </Text>
            </Box>

            <Box marginTop={1}>
              <Text dimColor>Routes exported successfully to JSON file.</Text>
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
