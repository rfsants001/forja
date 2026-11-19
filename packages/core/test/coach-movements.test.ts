import { describe, it, expect } from 'vitest';
import { movementFamilyFor, movementIdentity, allowsCoachRole } from '../src/coach-movements';

describe('canonical coach movements', () => {
  it('recognizes translated lateral raises even when no family was supplied', () => {
    const pt = { name: 'Elevação lateral com halter em pé', muscle: 'shoulders', resistance: 'halter' };
    const en = { name: 'dumbbell lateral raise', muscle: 'shoulders', resistance: 'halter' };
    expect(movementFamilyFor(pt)).toBe('lateral-raise');
    expect(movementIdentity(pt)).toBe(movementIdentity(en));
  });
  it('deduplicates translated calf raises while preserving posture and laterality', () => {
    const base = { name: 'Panturrilha em pé com halter', muscle: 'calves', resistance: 'halter' };
    expect(movementIdentity(base)).toBe(movementIdentity({ ...base, name: 'dumbbell standing calf raise' }));
    expect(movementIdentity(base)).not.toBe(movementIdentity({ ...base, name: 'Panturrilha sentado com halter' }));
    expect(movementIdentity(base)).not.toBe(movementIdentity({ ...base, name: 'Panturrilha unilateral com halter' }));
  });
  it('routes rear delts into Pull and reserves Push for its own shoulder movements', () => {
    const rear = { name: 'Crucifixo inverso com halteres', muscle: 'shoulders' };
    expect(allowsCoachRole(rear, 'pull')).toBe(true);
    expect(allowsCoachRole(rear, 'push')).toBe(false);
    expect(allowsCoachRole({ name: 'Desenvolvimento Arnold', muscle: 'shoulders' }, 'push')).toBe(true);
  });
  it('allows explicit core accessories on leg days without admitting upper-body presses', () => {
    expect(allowsCoachRole({ name: 'Hollow body rocks', muscle: 'abs' }, 'legs')).toBe(true);
    expect(allowsCoachRole({ name: 'Russian twist', muscle: 'obliques' }, 'lower')).toBe(true);
    expect(allowsCoachRole({ name: 'Supino com halter', muscle: 'chest' }, 'legs')).toBe(false);
  });
  it('recognizes a regular floor push-up regardless of an explicit floor label', () => {
    const base = { name: 'Flexão diamante no chão', muscle: 'chest', resistance: 'peso corporal' };
    expect(movementIdentity(base)).toBe(movementIdentity({ ...base, name: 'Flexão diamante (finalizador)' }));
    expect(movementIdentity(base)).not.toBe(movementIdentity({ ...base, name: 'Flexão declinada' }));
  });
});
