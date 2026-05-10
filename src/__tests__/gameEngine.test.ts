import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParticle } from '../gameEngine';

describe('createParticle', () => {
  it('should create particle with valid properties', () => {
    const particle = createParticle(100, 200, '#FF0000');

    expect(particle).toBeDefined();
    expect(particle.id).toBeDefined();
    expect(particle.x).toBe(100);
    expect(particle.y).toBe(200);
    expect(particle.vx).toBeDefined();
    expect(particle.vy).toBeDefined();
    expect(particle.life).toBe(1.0);
    expect(particle.maxLife).toBe(1.0);
    expect(particle.color).toBe('#FF0000');
    expect(particle.size).toBeGreaterThan(0);
    expect(particle.size).toBeLessThanOrEqual(5);
  });

  it('should generate unique IDs', () => {
    const p1 = createParticle(0, 0, '#000');
    const p2 = createParticle(0, 0, '#000');
    expect(p1.id).not.toBe(p2.id);
  });

  it('should have velocity within expected range', () => {
    const particle = createParticle(100, 100, '#FFF');
    expect(Math.abs(particle.vx)).toBeLessThanOrEqual(2);
    expect(Math.abs(particle.vy)).toBeLessThanOrEqual(2);
  });
});

describe('Particle lifecycle', () => {
  it('should initialize with full life', () => {
    const particle = createParticle(0, 0, '#FFF');
    expect(particle.life).toBe(particle.maxLife);
  });
});