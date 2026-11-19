export interface MovementDescription {
  name: string;
  muscle?: string;
  primaryMuscle?: string;
  family?: string;
  resistance?: string;
}
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export function isUnilateralMovement(exercise: MovementDescription): boolean {
  return /\b(unilateral|one ?arm|single ?arm|one ?leg|single ?leg)\b/.test(normalize(exercise.name));
}

export function movementFamilyFor(exercise: MovementDescription): string | undefined {
  const name = normalize(exercise.name);
  const muscle = exercise.primaryMuscle ?? exercise.muscle;
  const inMuscles = (...groups: string[]) => !muscle || groups.includes(muscle);
  if (inMuscles('abs', 'obliques') && /\b(russian twist|rotacao de tronco|trunk rotation)\b/.test(name)) return 'core-rotation';
  if (inMuscles('abs', 'obliques') && /\b(hollow|dead bug|plank|prancha)\b/.test(name)) return 'core-stability';
  if (inMuscles('abs', 'obliques') && /\b(crunch|situps?|sit ups?|abdomina[il]|leg raise)\b/.test(name)) return 'core-flexion';
  if (inMuscles('calves') && /\b(calf raises?|calves raises?|panturrilha|gemeos)\b/.test(name)) return 'calf-raise';
  if (inMuscles('hamstrings') && /\b(leg curl|flexao de pernas|flexora)\b/.test(name)) return 'leg-curl';
  if (inMuscles('forearms') && /\b(wrist|punho)\b/.test(name)) {
    if (/\b(extension|extensao|reverse|reverso)\b/.test(name)) return 'wrist-extension';
    if (/\b(curl|flexao|flexion)\b/.test(name)) return 'wrist-flexion';
  }
  if (inMuscles('shoulders', 'back') && /\b(reverse fly|rear delt|crucifixo inverso|bent over lateral raise)\b/.test(name)) return 'rear-delt-fly';
  if (inMuscles('shoulders') && /\b(lateral raises?|side raises?|elevacao lateral)\b/.test(name)) return 'lateral-raise';
  if (inMuscles('shoulders') && /\b(front raises?|elevacao frontal)\b/.test(name)) return 'front-raise';
  if (inMuscles('traps') && /\b(shrug|encolhimento)\b/.test(name)) return 'shrug';
  if (inMuscles('lats', 'back', 'chest') && /\bpullover\b/.test(name)) return 'pullover';
  if (inMuscles('chest') && /\b(fly|flyes|crossovers?|pec deck|peck deck|crucifixo|butterfly)\b/.test(name)) return 'chest-fly';
  if (inMuscles('chest') && /\b(bench press|chest press|supino|pushup|push up|flexao)\b/.test(name)) return 'chest-press';
  if (inMuscles('shoulders') && /\b(overhead press|shoulder press|military press|desenvolvimento)\b/.test(name)) return 'overhead-press';
  if (inMuscles('back', 'lats') && /\b(row|remada)\b/.test(name)) return 'row';
  if (inMuscles('back', 'lats') && /\b(pullup|pull up|chinup|chin up|pulldown|puxada|barra fixa)\b/.test(name)) return 'vertical-pull';
  if (inMuscles('quads', 'glutes') && /\b(lunge|afundo|split squat|passada)\b/.test(name)) return 'lunge';
  if (inMuscles('quads', 'glutes') && /\b(squat|agachamento)\b/.test(name)) return 'squat';
  if (inMuscles('quads') && /\bleg press\b/.test(name)) return 'leg-press';
  if (inMuscles('back', 'hamstrings', 'glutes') && /\b(deadlift|levantamento terra|terra romeno|stiff)\b/.test(name)) return 'hinge';
  if (inMuscles('glutes') && /\b(hip thrust|glute bridge|elevacao pelvica|ponte de gluteo)\b/.test(name)) return 'hip-extension';
  if (inMuscles('biceps') && /\b(curl|rosca)\b/.test(name)) return 'biceps-curl';
  if (inMuscles('triceps') && /\b(extension|pushdown|extensao|triceps testa|triceps frances|skull crusher)\b/.test(name)) return 'triceps-extension';
}

const upper = ['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps'];
const lower = ['quads', 'hamstrings', 'glutes', 'calves'];
export function allowsCoachRole(exercise: MovementDescription, role: string): boolean {
  const muscle = exercise.primaryMuscle ?? exercise.muscle ?? '';
  const family = movementFamilyFor(exercise) ?? exercise.family;
  if (role === 'push') return ['chest', 'shoulders', 'triceps'].includes(muscle) && family !== 'rear-delt-fly';
  if (role === 'pull') return ['back', 'lats', 'biceps', 'forearms', 'traps'].includes(muscle) || (muscle === 'shoulders' && family === 'rear-delt-fly');
  if (role === 'upper') return upper.includes(muscle);
  if (role === 'lower' || role === 'legs') return lower.includes(muscle) || (['abs', 'obliques'].includes(muscle) && !!family?.startsWith('core-'));
  return role === 'full' && [...upper, ...lower, 'abs', 'obliques', 'fullbody'].includes(muscle);
}

/** Detect duplicate catalog IDs and translations of the same known movement. */
export function movementIdentity(exercise: MovementDescription) {
  const name = normalize(exercise.name);
  const family = movementFamilyFor(exercise) ?? exercise.family;
  if (!family) return 'name:' + name.replace(/\s+v?\s*\d+$/, '');
  const angle = family === 'core-rotation' && /\brussian twist\b/.test(name) ? 'floor'
    : /\b(incline|inclinad[oa])\b/.test(name) ? 'incline'
    : /\b(decline|declinad[oa])\b/.test(name) ? 'decline'
    : family === 'chest-press' && /\b(pushups?|push ups?|flexao)\b/.test(name) && !/\b(wall|parede)\b/.test(name) ? 'floor'
    : /\b(floor|chao|solo)\b/.test(name) ? 'floor' : 'standard';
  const unilateral = isUnilateralMovement(exercise);
  // A family is a programming group, not an exercise identity. Preserve meaningful
  // grip/setup variants; ignore load, tempo, pauses and catalog aliases.
  const grip = /\b(hammer|martelo|neutral|neutr[oa])\b/.test(name) ? 'neutral'
    : /\b(chinups?|chin ups?|supinated|supinad[oa]|underhand)\b/.test(name) ? 'supinated'
    : family === 'biceps-curl' && /\b(reverse|revers[oa]|invers[oa]|pronated|pronad[oa])\b/.test(name) ? 'pronated'
    : family === 'biceps-curl' ? 'supinated' : 'standard';
  const width = /\b(wide|larg[oa]|aberta)\b/.test(name) ? 'wide'
    : /\b(close|narrow|fechad[oa]|diamond|diamante)\b/.test(name) ? 'close' : 'standard';
  const forms: Record<string, string> = {
    'calf-raise': /\b(seated|sentad[oa])\b/.test(name) ? 'seated' : 'standing',
    'lateral-raise': /\b(seated|sentad[oa])\b/.test(name) ? 'seated' : 'standing',
    'core-stability': /\bhollow\b/.test(name) ? 'hollow' : /\bdead bug\b/.test(name) ? 'dead-bug' : 'standard',
    'biceps-curl': /\b(concentration|concentrad[oa])\b/.test(name) ? 'concentration'
      : /\b(preacher|scott)\b/.test(name) ? 'preacher' : /\b(spider|aranha)\b/.test(name) ? 'spider' : 'standard',
    row: /\b(inverted|invers[oa]|australian)\b/.test(name) ? 'inverted'
      : /\b(chest supported|peito apoiado)\b/.test(name) ? 'supported'
      : /\b(seated|sentad[oa])\b/.test(name) ? 'seated' : 'standard',
    'overhead-press': /\barnold\b/.test(name) ? 'arnold' : 'standard',
    'triceps-extension': /\b(overhead|acima da cabeca|frances)\b/.test(name) ? 'overhead'
      : /\b(lying|deitad[oa]|testa|skull crusher)\b/.test(name) ? 'lying' : 'standard',
    hinge: /\b(romanian|romeno)\b/.test(name) ? 'romanian' : /\bstiff\b/.test(name) ? 'stiff' : 'standard',
    'chest-press': /\b(wall|parede)\b/.test(name) ? 'wall'
      : /\b(scapular|escapular)\b/.test(name) ? 'scapular' : /\b(kneeling|joelhos)\b/.test(name) ? 'kneeling' : 'standard',
    squat: /\b(sumo)\b/.test(name) ? 'sumo' : /\b(goblet|calice)\b/.test(name) ? 'goblet' : 'standard',
    lunge: /\b(bulgarian|bulgar[oa])\b/.test(name) ? 'bulgarian'
      : /\b(lateral|side)\b/.test(name) ? 'lateral'
      : /\b(walking|andando|caminhando)\b/.test(name) ? 'walking'
      : /\b(reverse|revers[oa])\b/.test(name) ? 'reverse' : 'standard',
  };
  const resistance = family === 'vertical-pull' && ['peso corporal', 'bodyweight', 'body weight', 'barra fixa', 'pullup bar'].includes(normalize(exercise.resistance ?? ''))
    ? 'bodyweight-pullup' : exercise.resistance ?? '';
  return [family, resistance, angle, unilateral, grip, width, forms[family] ?? 'standard'].join(':');
}

