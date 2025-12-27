import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '../components/Spinner';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ProgressBar } from '../components/ProgressBar';
import { processMaps } from '../../lib/maps';
import { createProgressEmitter } from '../../lib/events';
import type { ProgressEvent } from '../../lib/events';

interface MapsScreenProps {
  onExit: () => void;
}

type Status = 'idle' | 'running' | 'complete' | 'error';

export const MapsScreen: React.FC<MapsScreenProps> = ({ onExit }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [currentStage, setCurrentStage] = useState<string>('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const emitter = createProgressEmitter();

    emitter.on('progress', (event: ProgressEvent) => {
      if (event.type === 'start') {
        setStatus('running');
        setCurrentStage(event.stage);
        setProgress({ current: 0, total: event.total || 0 });
        setMessage(event.message || 'Starting...');
      } else if (event.type === 'progress') {
        setCurrentStage(event.stage);
        setProgress({ current: event.current || 0, total: event.total || 0 });
        setMessage(event.message || 'Processing...');
      } else if (event.type === 'complete') {
        setCurrentStage(event.stage);
        setMessage(event.message || 'Complete');
        if (event.metadata) {
          setMetadata((prev) => ({ ...prev, ...event.metadata }));
        }
        // Check if all stages are complete
        if (event.stage === 'export_layers') {
          setStatus('complete');
        }
      } else if (event.type === 'error') {
        setStatus('error');
        setErrorMessage(event.message || event.error?.message || 'Unknown error');
      }
    });

    // Start processing automatically
    processMaps({ emitter }).catch((err) => {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to process maps');
    });

    return () => {
      emitter.removeAllListeners();
    };
  }, []);

  const shortcuts = [
    { key: 'q', label: 'Quit' },
    { key: 'Esc', label: 'Back' },
  ];

  return (
    <Box flexDirection="column" height="100%">
      <Header
        title="PROCESS MAPS"
        subtitle="Convert shapefiles to TopoJSON and generate SVG"
      />

      <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
        {/* Status */}
        <Box marginBottom={1}>
          <Text>
            Status:{' '}
            <Text color={status === 'running' ? 'cyan' : status === 'complete' ? 'green' : 'white'}>
              {status === 'idle' && 'Initializing...'}
              {status === 'running' && 'Processing...'}
              {status === 'complete' && 'Complete'}
              {status === 'error' && 'Error'}
            </Text>
          </Text>
        </Box>

        {/* Current Stage */}
        {status === 'running' && (
          <Box marginBottom={1}>
            <Spinner label={message} />
          </Box>
        )}

        {/* Progress Bar */}
        {status === 'running' && progress.total > 0 && (
          <Box marginBottom={1}>
            <ProgressBar current={progress.current} total={progress.total} />
          </Box>
        )}

        {/* Stage Labels */}
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray">Workflow Steps:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>
              {currentStage === 'process_map' ? '▶ ' : metadata.outputPath ? '✓ ' : '  '}
              Process shapefiles to TopoJSON
            </Text>
            <Text>
              {currentStage === 'generate_svg' ? '▶ ' : metadata.sizeKB ? '✓ ' : '  '}
              Generate combined SVG (legacy)
            </Text>
            <Text>
              {currentStage === 'export_layers' ? '▶ ' : metadata.waterSizeKB ? '✓ ' : '  '}
              Export layered SVG files
            </Text>
          </Box>
        </Box>

        {/* Complete Summary */}
        {status === 'complete' && (
          <Box marginTop={1} flexDirection="column">
            <Text color="green">Maps processed successfully!</Text>
            <Box marginTop={1} flexDirection="column">
              {!!metadata.outputPath && (
                <Text color="gray">
                  TopoJSON: {String(metadata.outputPath)} ({String(metadata.sizeMB || 'unknown')} MB)
                </Text>
              )}
              {!!metadata.sizeKB && !!metadata.outputPath && (
                <Text color="gray">
                  SVG (legacy): {String(metadata.outputPath).replace('.json', '.svg')} (
                  {String(metadata.sizeKB || 'unknown')} KB)
                </Text>
              )}
              {!!metadata.waterSizeKB && (
                <Text color="gray">
                  Layers: water.svg ({String(metadata.waterSizeKB)} KB), roads.svg (
                  {String(metadata.roadSizeKB)} KB), manifest.json
                </Text>
              )}
            </Box>
          </Box>
        )}

        {/* Error Display */}
        {status === 'error' && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red">Error: {errorMessage}</Text>
            <Box marginTop={1}>
              <Text color="gray">
                Check that shapefile data exists in data/maastokartta_esri/
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      <Footer shortcuts={shortcuts} />
    </Box>
  );
};
