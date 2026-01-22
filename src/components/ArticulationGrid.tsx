'use client';

import { Articulation, ArticulationSet, groupArticulations, countAutoAssignedRemotes } from '@/lib/logicArticulationParser';
import { ArticulationButton } from './ArticulationButton';
import { useState, useMemo } from 'react';

interface ArticulationGridProps {
  articulationSet: ArticulationSet;
  columns?: number;
  buttonSize?: 'small' | 'medium' | 'large';
}

export function ArticulationGrid({
  articulationSet,
  columns = 4,
  buttonSize = 'medium'
}: ArticulationGridProps) {
  const [activeArticulationId, setActiveArticulationId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'attribute' | 'direction'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter articulations
  const filteredArticulations = useMemo(() => {
    let arts = articulationSet.articulations;

    if (filterType === 'attribute') {
      arts = arts.filter(a => a.articulationType === 0);
    } else if (filterType === 'direction') {
      arts = arts.filter(a => a.articulationType === 1);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      arts = arts.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.shortName.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query)
      );
    }

    return arts;
  }, [articulationSet.articulations, filterType, searchQuery]);

  // Group by group number
  const groupedArticulations = useMemo(() => {
    return groupArticulations(filteredArticulations);
  }, [filteredArticulations]);

  const handleActivate = (articulation: Articulation) => {
    setActiveArticulationId(articulation.id);
  };

  const hasMultipleGroups = groupedArticulations.size > 1;

  // Count types
  const typeCount = useMemo(() => {
    const attributes = articulationSet.articulations.filter(a => a.articulationType === 0).length;
    const directions = articulationSet.articulations.filter(a => a.articulationType === 1).length;
    return { attributes, directions };
  }, [articulationSet.articulations]);

  const autoAssignedCount = useMemo(() => {
    return countAutoAssignedRemotes(articulationSet);
  }, [articulationSet]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header and filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-semibold text-white truncate max-w-full">
          {articulationSet.name}
        </h2>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-600
                       text-white text-sm w-40 focus:outline-none focus:ring-2
                       focus:ring-blue-500"
          />

          {/* Type filter */}
          {typeCount.attributes > 0 && typeCount.directions > 0 && (
            <div className="flex rounded-lg overflow-hidden border border-gray-600">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors
                  ${filterType === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('attribute')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors
                  ${filterType === 'attribute'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                Attr ({typeCount.attributes})
              </button>
              <button
                onClick={() => setFilterType('direction')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors
                  ${filterType === 'direction'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                Dir ({typeCount.directions})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-gray-400 text-sm">
          {filteredArticulations.length} articulation{filteredArticulations.length !== 1 ? 's' : ''}
        </p>

        {autoAssignedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-orange-500/20 border border-orange-500/50">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-xs text-orange-300">
              {autoAssignedCount} auto-assigned
            </span>
          </div>
        )}
      </div>

      {/* Grid */}
      {hasMultipleGroups ? (
        <div className="space-y-6">
          {Array.from(groupedArticulations.entries())
            .sort(([a], [b]) => a - b)
            .map(([groupNum, arts]) => (
              <div key={groupNum} className="space-y-2">
                <h3 className="text-sm font-medium text-gray-400">
                  Group {groupNum + 1}
                </h3>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
                  }}
                >
                  {arts.map(art => (
                    <ArticulationButton
                      key={art.id}
                      articulation={art}
                      isActive={art.id === activeArticulationId}
                      onActivate={handleActivate}
                      size={buttonSize}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
          }}
        >
          {filteredArticulations.map(art => (
            <ArticulationButton
              key={art.id}
              articulation={art}
              isActive={art.id === activeArticulationId}
              onActivate={handleActivate}
              size={buttonSize}
            />
          ))}
        </div>
      )}

      {filteredArticulations.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          No articulations found
        </div>
      )}
    </div>
  );
}
