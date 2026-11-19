import { describe, expect, it } from 'vitest';
import { isCoachWorkingExercise } from '../src/coach-exercises';

describe('working-exercise selection', () => {
  it('keeps preparatory drills out of the strength exercise count', () => {
    for (const name of ['Remada deitada sem carga', 'elbow lift - reverse push-up', 'scapular pull-up', 'Flexão escapular']) {
      expect(isCoachWorkingExercise({ name }, 'advanced')).toBe(false);
      expect(isCoachWorkingExercise({ name }, 'beginner')).toBe(false);
    }
  });
  it('reserves simple regressions for levels where they may be working exercises', () => {
    expect(isCoachWorkingExercise({ id: 'home-wall-pushup', name: 'Flexão na parede' }, 'beginner')).toBe(true);
    expect(isCoachWorkingExercise({ id: 'home-wall-pushup', name: 'Flexão na parede' }, 'advanced')).toBe(false);
  });
  it('preserves demanding bodyweight movements and loaded home variants', () => {
    for (const name of ['Barra Fixa (Puxada)', 'Pull-up pegada larga', 'Flexão diamante', 'Ponte de glúteo no chão com anilha', 'Remada unilateral com halter']) {
      expect(isCoachWorkingExercise({ name }, 'advanced')).toBe(true);
    }
  });
  it('does not mistake a coaching cue for a preparatory movement', () => {
    expect(isCoachWorkingExercise({ name: 'Remada com halter — controle escapular' }, 'advanced')).toBe(true);
  });
});
