'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArticulationGrid } from '@/components/ArticulationGrid';
import { ArticulationSet, createSimpleArticulationSet, parseLogicArticulationSet, autoAssignRemoteTriggers, hasUnassignedRemotes } from '@/lib/logicArticulationParser';
import { midiHandler, MidiState } from '@/lib/midiHandler';

// Demo articulation set for testing
const DEMO_ARTICULATION_SET = createSimpleArticulationSet('Demo Strings', [
  { name: 'Sustain', note: 0, color: 6 },
  { name: 'Staccato', note: 1, color: 1 },
  { name: 'Spiccato', note: 2, color: 2 },
  { name: 'Pizzicato', note: 3, color: 4 },
  { name: 'Tremolo', note: 4, color: 5 },
  { name: 'Trills', note: 5, color: 7 },
  { name: 'Harmonics', note: 6, color: 8 },
  { name: 'Col Legno', note: 7, color: 3 },
]);

export default function Home() {
  const [midiState, setMidiState] = useState<MidiState | null>(null);
  const [currentSet, setCurrentSet] = useState<ArticulationSet>(DEMO_ARTICULATION_SET);
  const [currentTrack, setCurrentTrack] = useState<string>('');
  const [currentArtSetId, setCurrentArtSetId] = useState<number | null>(null);
  const [loadedSets, setLoadedSets] = useState<Map<string, ArticulationSet>>(new Map());
  const [columns, setColumns] = useState(4);
  const [showSettings, setShowSettings] = useState(false);

  // Initialize MIDI
  useEffect(() => {
    midiHandler.initialize().then(state => {
      setMidiState(state);
    });

    const unsubscribe = midiHandler.subscribe(state => {
      setMidiState(state);
    });

    return () => unsubscribe();
  }, []);

  // Listen for track changes from LogicTrackMonitor
  useEffect(() => {
    const unsubscribe = midiHandler.onTrackName(async (trackName) => {
      setCurrentTrack(trackName);

      // First check if we already have a matching loaded set
      for (const [name, artSet] of loadedSets) {
        if (name.toLowerCase().includes(trackName.toLowerCase()) ||
            trackName.toLowerCase().includes(name.toLowerCase())) {
          console.log(`Using cached set "${artSet.name}" for track "${trackName}"`);
          setCurrentSet(artSet);
          return;
        }
      }

      // Search API for matching articulation sets
      try {
        const response = await fetch(`/api/articulations/?search=${encodeURIComponent(trackName)}`);
        const data = await response.json();

        if (data.sets && data.sets.length > 0) {
          // Find best match - prefer exact name matches
          const exactMatch = data.sets.find((s: { name: string }) =>
            s.name.toLowerCase().includes(trackName.toLowerCase())
          );
          const bestMatch = exactMatch || data.sets[0];

          console.log(`Found articulation set "${bestMatch.name}" for track "${trackName}"`);

          // Load the articulation set
          const loadResponse = await fetch('/api/articulations/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: bestMatch.path })
          });
          const loadData = await loadResponse.json();

          if (loadData.content) {
            let artSet = parseLogicArticulationSet(loadData.content, bestMatch.name);

            // Auto-assign remote triggers if needed
            if (hasUnassignedRemotes(artSet)) {
              artSet = autoAssignRemoteTriggers(artSet);
            }

            // Cache it
            setLoadedSets(prev => new Map(prev).set(artSet.name, artSet));
            setCurrentSet(artSet);
            console.log(`Loaded articulation set: ${artSet.name} with ${artSet.articulations.length} articulations`);
          }
        } else {
          console.log(`No articulation set found for track: ${trackName}`);
        }
      } catch (error) {
        console.error('Failed to search articulation sets:', error);
      }
    });

    return () => unsubscribe();
  }, [loadedSets]);

  // Listen for articulation set changes from PlugSearch (via MetaServer)
  useEffect(() => {
    const unsubscribe = midiHandler.onArticulationSetChange((artSetId) => {
      console.log(`PlugSearch articulation set ID: ${artSetId}`);
      setCurrentArtSetId(artSetId);

      // TODO: Map artSetId to actual articulation set
      // The ID might correspond to the order of articulation sets in Logic
      // or it could be an internal PlugSearch/Art Conductor ID
    });

    return () => unsubscribe();
  }, [loadedSets]);

  // Handle file drop/upload
  const handleFileUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.name.endsWith('.plist') || file.name.endsWith('.xml')) {
        try {
          const content = await file.text();
          let artSet = parseLogicArticulationSet(content, file.name);

          // Auto-assign remote triggers if needed
          if (hasUnassignedRemotes(artSet)) {
            artSet = autoAssignRemoteTriggers(artSet);
          }

          setLoadedSets(prev => new Map(prev).set(artSet.name, artSet));
          setCurrentSet(artSet);
          console.log(`Loaded articulation set: ${artSet.name}`);
        } catch (error) {
          console.error(`Failed to parse ${file.name}:`, error);
        }
      }
    }
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <main
      className="min-h-screen p-4"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Logic Remote</h1>

          {/* Connection status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${midiState?.isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
            />
            <span className="text-sm text-gray-400">
              {midiState?.isConnected
                ? midiState.useWebSocket
                  ? 'MIDI Bridge'
                  : midiState.webSocketPort || 'Connected'
                : 'Disconnected'
              }
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Current track */}
          {currentTrack && (
            <span className="text-sm text-blue-400 bg-blue-900/30 px-3 py-1 rounded-lg">
              {currentTrack}
            </span>
          )}

          {/* PlugSearch articulation set ID */}
          {currentArtSetId !== null && (
            <span className="text-sm text-green-400 bg-green-900/30 px-3 py-1 rounded-lg">
              Art ID: {currentArtSetId}
            </span>
          )}

          {/* Settings button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="mb-4 p-4 bg-gray-800 rounded-lg space-y-4">
          <h3 className="font-semibold">Settings</h3>

          {/* Column selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400">Columns:</label>
            <div className="flex gap-1">
              {[3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setColumns(n)}
                  className={`px-3 py-1 rounded text-sm ${columns === n ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">
              Load Articulation Set (.plist):
            </label>
            <input
              type="file"
              accept=".plist,.xml"
              multiple
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              className="text-sm text-gray-400 file:mr-3 file:py-1 file:px-3
                         file:rounded file:border-0 file:bg-gray-700 file:text-white
                         hover:file:bg-gray-600"
            />
          </div>

          {/* Loaded sets */}
          {loadedSets.size > 0 && (
            <div>
              <label className="text-sm text-gray-400 block mb-2">
                Loaded Sets:
              </label>
              <div className="flex flex-wrap gap-2">
                {Array.from(loadedSets.values()).map(artSet => (
                  <button
                    key={artSet.name}
                    onClick={() => setCurrentSet(artSet)}
                    className={`px-3 py-1 rounded text-sm ${currentSet.name === artSet.name
                      ? 'bg-blue-600'
                      : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                  >
                    {artSet.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MIDI output */}
          {midiState && midiState.outputs.length > 0 && (
            <div>
              <label className="text-sm text-gray-400 block mb-2">
                MIDI Output:
              </label>
              <select
                value={midiState.selectedOutputId || ''}
                onChange={(e) => midiHandler.selectOutput(e.target.value)}
                className="w-full p-2 rounded bg-gray-700 text-white text-sm"
              >
                {midiState.outputs.map(output => (
                  <option key={output.id} value={output.id}>
                    {output.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Articulation Grid */}
      <ArticulationGrid
        articulationSet={currentSet}
        columns={columns}
        buttonSize="medium"
      />

      {/* Instructions overlay when no articulations loaded */}
      {currentSet === DEMO_ARTICULATION_SET && (
        <div className="fixed bottom-4 left-4 right-4 p-4 bg-gray-800/90 backdrop-blur rounded-lg border border-gray-700">
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-white">Getting Started:</span>
            {' '}Drop a Logic Pro Articulation Set (.plist) file here, or click Settings to upload.
            Run <code className="bg-gray-700 px-1 rounded">node midi-server.js</code> and the LogicTrackMonitor app for automatic track switching.
          </p>
        </div>
      )}
    </main>
  );
}
