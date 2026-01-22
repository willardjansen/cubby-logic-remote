import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// Art Conductor directory
const ART_CONDUCTOR_DIR = join(
  homedir(),
  'Music/Audio Music Apps/Articulation Settings/🅱️ Art Conductor Logic'
);

// Recursively find all .plist files
async function findPlistFiles(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await findPlistFiles(fullPath, files);
      } else if (entry.name.endsWith('.plist')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Directory doesn't exist or not accessible
  }

  return files;
}

// GET /api/articulations - List available articulation sets
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase();

  try {
    const plistFiles = await findPlistFiles(ART_CONDUCTOR_DIR);

    // Extract names from paths
    let sets = plistFiles.map(path => {
      const relativePath = path.replace(ART_CONDUCTOR_DIR + '/', '');
      const name = relativePath.replace('.plist', '').split('/').pop() || '';
      return {
        name,
        path: relativePath,
        fullPath: path
      };
    });

    // Filter by search term if provided
    if (search) {
      sets = sets.filter(s =>
        s.name.toLowerCase().includes(search) ||
        s.path.toLowerCase().includes(search)
      );
    }

    // Limit results
    sets = sets.slice(0, 100);

    return NextResponse.json({ sets, total: plistFiles.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to scan articulation sets' }, { status: 500 });
  }
}

// POST /api/articulations/load - Load a specific articulation set
export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json({ error: 'Path required' }, { status: 400 });
    }

    const fullPath = join(ART_CONDUCTOR_DIR, path);

    // Security: ensure path is within Art Conductor directory
    if (!fullPath.startsWith(ART_CONDUCTOR_DIR)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const content = await readFile(fullPath, 'utf-8');

    return NextResponse.json({ content, path });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load articulation set' }, { status: 500 });
  }
}
