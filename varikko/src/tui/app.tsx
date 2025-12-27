import React, { useState } from 'react';
import { useApp } from 'ink';
import { Dashboard, type Screen } from './dashboard';
import { FetchZonesScreen } from './screens/fetch-zones';
import { GeocodeScreen } from './screens/geocode';
import RoutesScreen from './screens/routes';
import { ClearScreen } from './screens/clear';
import DecilesScreen from './screens/deciles';
import { MapsScreen } from './screens/maps';
import { HelpScreen } from './screens/help';
import { openDB, getDBPath } from '../lib/db';
import type { ClearOptions } from '../lib/clearing';

export function App() {
  const { exit } = useApp();
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [testMode, setTestMode] = useState(false);

  const handleNavigate = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const handleBackToDashboard = () => {
    setCurrentScreen('dashboard');
  };

  const handleToggleTestMode = () => {
    setTestMode((prev) => !prev);
  };

  const handleQuit = () => {
    exit();
  };

  // Render current screen
  switch (currentScreen) {
    case 'dashboard':
      return (
        <Dashboard
          onNavigate={handleNavigate}
          onQuit={handleQuit}
          testMode={testMode}
          onToggleTestMode={handleToggleTestMode}
        />
      );

    case 'fetch-zones':
      return (
        <FetchZonesScreen
          testMode={testMode}
          onComplete={handleBackToDashboard}
          onCancel={handleBackToDashboard}
        />
      );

    case 'geocode':
      return (
        <GeocodeScreen
          testMode={testMode}
          apiKey={process.env.DIGITRANSIT_API_KEY || process.env.HSL_API_KEY}
          onComplete={handleBackToDashboard}
          onCancel={handleBackToDashboard}
        />
      );

    case 'routes': {
      const db = openDB();
      return (
        <RoutesScreen
          db={db}
          testMode={testMode}
          useZoneBased={true}
          onExit={() => {
            db.close();
            handleBackToDashboard();
          }}
        />
      );
    }

    case 'clear': {
      const db = openDB();
      // Default clear options - clear all
      const clearOptions: ClearOptions = {
        routes: false,
        places: false,
        metadata: false,
        deciles: false,
        force: true, // Skip confirmation in TUI (we'll add our own)
      };
      return (
        <ClearScreen
          db={db}
          options={clearOptions}
        />
      );
    }

    case 'deciles':
      return (
        <DecilesScreen
          dbPath={getDBPath()}
          force={false}
          onExit={(error) => {
            if (error) {
              console.error('Deciles calculation failed:', error);
            }
            handleBackToDashboard();
          }}
        />
      );

    case 'maps':
      return <MapsScreen onExit={handleBackToDashboard} />;

    case 'help':
      return <HelpScreen onBack={handleBackToDashboard} />;

    default:
      return (
        <Dashboard
          onNavigate={handleNavigate}
          onQuit={handleQuit}
          testMode={testMode}
          onToggleTestMode={handleToggleTestMode}
        />
      );
  }
}
