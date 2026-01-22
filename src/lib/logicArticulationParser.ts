/**
 * Logic Pro Articulation Set Parser
 *
 * Logic Pro stores articulation sets as .plist files (XML property lists).
 * This parser converts them to our common Articulation format.
 *
 * Location: ~/Music/Audio Music Apps/Articulation Sets/
 */

export interface MidiMessage {
  status: number;    // 144 = Note On, 176 = CC
  data1: number;     // Note number or CC number
  data2: number;     // Velocity or CC value
}

export interface RemoteTrigger {
  status: number;    // 144 = Note On (default)
  data1: number;     // MIDI note number to trigger this articulation
  isAutoAssigned?: boolean;
}

export interface Articulation {
  id: string;
  name: string;
  shortName: string;
  description: string;
  color: number;
  group: number;
  midiMessages: MidiMessage[];
  remoteTrigger?: RemoteTrigger;
  keySwitch?: number;
  articulationType: number; // 0 = attribute, 1 = direction
  midiChannel?: number;
  sourceMap?: string;
}

export interface ArticulationSet {
  name: string;
  fileName: string;
  articulations: Articulation[];
  isMerged?: boolean;
  sourceMapNames?: string[];
}

// Color mapping for Logic articulations
export const LOGIC_COLORS: Record<number, string> = {
  0: '#808080',   // Gray (default)
  1: '#e74c3c',   // Red
  2: '#e67e22',   // Orange
  3: '#f1c40f',   // Yellow
  4: '#2ecc71',   // Green
  5: '#1abc9c',   // Teal
  6: '#3498db',   // Blue
  7: '#9b59b6',   // Purple
  8: '#e91e63',   // Pink
  9: '#795548',   // Brown
  10: '#607d8b',  // Gray Blue
  11: '#00bcd4',  // Cyan
  12: '#8bc34a',  // Light Green
  13: '#ff5722',  // Deep Orange
  14: '#673ab7',  // Deep Purple
  15: '#03a9f4',  // Light Blue
};

/**
 * Parse Logic Pro Articulation Set from plist XML
 * Supports both standard Logic format and Art Conductor format
 */
export function parseLogicArticulationSet(plistContent: string, fileName: string): ArticulationSet {
  const parser = new DOMParser();
  const doc = parser.parseFromString(plistContent, 'text/xml');

  // Find the root dict
  const rootDict = doc.querySelector('plist > dict');
  if (!rootDict) {
    throw new Error('Invalid plist format: no root dict found');
  }

  // Parse the plist dict structure
  const rootData = parsePlistDict(rootDict);

  // Get the articulation set name
  let setName = rootData['Name'] || rootData['name'] || fileName.replace('.plist', '');
  // Clean up Art Conductor naming
  setName = setName.replace(/\.plist$/, '').replace(/^[A-Z]{2,}\s+/, '');

  // Get articulations array
  const articulationsData = rootData['Articulations'] || rootData['articulations'] || [];

  // Get switches array (Art Conductor format - defines remote triggers)
  const switchesData = rootData['Switches'] || rootData['switches'] || [];
  const switchesMap = new Map<number, any>();
  switchesData.forEach((sw: any) => {
    if (sw['ID'] !== undefined) {
      switchesMap.set(sw['ID'], sw);
    }
  });

  const articulations: Articulation[] = [];

  articulationsData.forEach((artData: any, index: number) => {
    const name = artData['Name'] || artData['name'] || `Articulation ${index + 1}`;
    const shortName = artData['ShortName'] || artData['shortName'] || name.substring(0, 4).toUpperCase();

    // Parse MIDI output settings
    const midiMessages: MidiMessage[] = [];
    const outputSettings = artData['Output'] || artData['output'] || {};

    // Art Conductor format: MB1 is note number, Status is string
    const mb1 = outputSettings['MB1'];
    const statusStr = outputSettings['Status'] || 'Note On';

    if (mb1 !== undefined && mb1 >= 0 && mb1 <= 127) {
      const status = statusStr === 'Note On' ? 144 :
                     statusStr === 'Control Change' ? 176 :
                     statusStr === 'Poly Pressure' ? 160 : 144;
      midiMessages.push({
        status,
        data1: mb1,
        data2: outputSettings['ValueLow'] || 127
      });
    }

    // Standard Logic format: Note key
    const keySwitch = outputSettings['Note'] ?? outputSettings['note'];
    if (keySwitch !== undefined && keySwitch >= 0 && keySwitch <= 127) {
      midiMessages.push({
        status: 144,
        data1: keySwitch,
        data2: outputSettings['Velocity'] || 127
      });
    }

    // CC messages
    const ccMessages = outputSettings['CC'] || outputSettings['cc'] || [];
    if (Array.isArray(ccMessages)) {
      ccMessages.forEach((cc: any) => {
        if (cc['Number'] !== undefined && cc['Value'] !== undefined) {
          midiMessages.push({
            status: 176,
            data1: cc['Number'],
            data2: cc['Value']
          });
        }
      });
    }

    // Remote trigger - check Switches array (Art Conductor format)
    let remoteTrigger: RemoteTrigger | undefined;
    const artId = artData['ID'] || artData['id'];
    const switchData = switchesMap.get(artId);

    if (switchData) {
      const switchMb1 = switchData['MB1'];
      const switchStatus = switchData['Status'] || 'Note On';
      if (switchMb1 !== undefined && switchMb1 >= 0 && switchMb1 <= 127) {
        const status = switchStatus === 'Note On' ? 144 :
                       switchStatus === 'Control Change' ? 176 :
                       switchStatus === 'Poly Pressure' ? 160 : 144;
        remoteTrigger = {
          status,
          data1: switchMb1,
          isAutoAssigned: false
        };
      }
    }

    // Fallback: use output note as remote trigger
    if (!remoteTrigger && mb1 !== undefined && mb1 >= 0) {
      remoteTrigger = {
        status: 144,
        data1: mb1,
        isAutoAssigned: true
      };
    }

    // Color - assign based on index if not specified
    const color = artData['Color'] || artData['color'] || (index % 16);

    // Group
    const group = artData['Group'] || artData['group'] || 0;

    // Type
    const artType = artData['Type'] || artData['type'] || 'attribute';
    const articulationType = artType === 'direction' ? 1 : 0;

    articulations.push({
      id: `logic_art_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      shortName,
      description: artData['Description'] || artData['description'] || name,
      color,
      group,
      midiMessages,
      remoteTrigger,
      keySwitch: mb1 ?? keySwitch,
      articulationType
    });
  });

  return {
    name: setName,
    fileName,
    articulations
  };
}

/**
 * Parse a plist dict element into a JavaScript object
 */
function parsePlistDict(dictElement: Element): Record<string, any> {
  const result: Record<string, any> = {};
  const children = Array.from(dictElement.children);

  for (let i = 0; i < children.length; i += 2) {
    const keyElement = children[i];
    const valueElement = children[i + 1];

    if (keyElement?.tagName === 'key' && valueElement) {
      const key = keyElement.textContent || '';
      result[key] = parsePlistValue(valueElement);
    }
  }

  return result;
}

/**
 * Parse a plist value element
 */
function parsePlistValue(element: Element): any {
  switch (element.tagName) {
    case 'string':
      return element.textContent || '';
    case 'integer':
      return parseInt(element.textContent || '0', 10);
    case 'real':
      return parseFloat(element.textContent || '0');
    case 'true':
      return true;
    case 'false':
      return false;
    case 'dict':
      return parsePlistDict(element);
    case 'array':
      return Array.from(element.children).map(parsePlistValue);
    case 'data':
      return element.textContent || '';
    case 'date':
      return new Date(element.textContent || '');
    default:
      return element.textContent;
  }
}

/**
 * Create articulation set from simple key switch definitions
 * Useful for quickly creating maps when you know the key switches
 */
export function createSimpleArticulationSet(
  name: string,
  keySwitches: Array<{ name: string; note: number; color?: number }>
): ArticulationSet {
  const articulations: Articulation[] = keySwitches.map((ks, index) => ({
    id: `simple_${index}_${Date.now()}`,
    name: ks.name,
    shortName: ks.name.substring(0, 4).toUpperCase(),
    description: ks.name,
    color: ks.color || 0,
    group: 0,
    midiMessages: [{
      status: 144,
      data1: ks.note,
      data2: 127
    }],
    remoteTrigger: {
      status: 144,
      data1: ks.note,
      isAutoAssigned: false
    },
    keySwitch: ks.note,
    articulationType: 0
  }));

  return {
    name,
    fileName: 'custom',
    articulations
  };
}

// Helper to convert MIDI note number to note name
export function midiNoteToName(note: number): string {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 2;
  const noteName = notes[note % 12];
  return `${noteName}${octave}`;
}

// Group articulations by their group number
export function groupArticulations(articulations: Articulation[]): Map<number, Articulation[]> {
  const groups = new Map<number, Articulation[]>();

  articulations.forEach(art => {
    const existing = groups.get(art.group) || [];
    existing.push(art);
    groups.set(art.group, existing);
  });

  return groups;
}

// Auto-assign remote triggers to articulations that don't have them
export function autoAssignRemoteTriggers(
  artSet: ArticulationSet,
  startNote: number = 0
): ArticulationSet {
  const usedNotes = new Set<number>();
  artSet.articulations.forEach(art => {
    if (art.remoteTrigger && !art.remoteTrigger.isAutoAssigned) {
      usedNotes.add(art.remoteTrigger.data1);
    }
  });

  let nextNote = startNote;

  const getNextAvailableNote = (): number => {
    while (usedNotes.has(nextNote) && nextNote <= 127) {
      nextNote++;
    }
    if (nextNote > 127) {
      throw new Error('No more available MIDI notes for remote triggers');
    }
    const note = nextNote;
    usedNotes.add(note);
    nextNote++;
    return note;
  };

  const updatedArticulations = artSet.articulations.map(art => {
    if (art.remoteTrigger) {
      return art;
    }

    return {
      ...art,
      remoteTrigger: {
        status: 144,
        data1: getNextAvailableNote(),
        isAutoAssigned: true,
      },
    };
  });

  return {
    ...artSet,
    articulations: updatedArticulations,
  };
}

// Check if any articulations need auto-assigned remote triggers
export function hasUnassignedRemotes(artSet: ArticulationSet): boolean {
  return artSet.articulations.some(art => !art.remoteTrigger);
}

// Count auto-assigned remotes
export function countAutoAssignedRemotes(artSet: ArticulationSet): number {
  return artSet.articulations.filter(art => art.remoteTrigger?.isAutoAssigned).length;
}
