import { describe, it, expect } from 'vitest';

describe('Cubby Logic Remote', () => {
  it('should have a valid package name', async () => {
    const pkg = await import('../package.json');
    expect(pkg.name).toBe('cubby-logic-remote');
  });

  it('should have required dependencies', async () => {
    const pkg = await import('../package.json');
    expect(pkg.dependencies).toHaveProperty('next');
    expect(pkg.dependencies).toHaveProperty('react');
    expect(pkg.dependencies).toHaveProperty('midi');
  });

  it('should have correct version format', async () => {
    const pkg = await import('../package.json');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
