import { useId, useState } from 'react';
import { useT } from '../lib/i18n';

export function CoachFileInput({ accept, disabled, onFile }: {
  accept: string;
  disabled?: boolean;
  onFile: (file?: File) => void;
}) {
  const t = useT();
  const id = useId();
  const [name, setName] = useState('');
  return <div className="coach-file-input">
    <span>{t('coach.referenceFile')}</span>
    <div className="coach-file-action">
      <input id={id} type="file" accept={accept} disabled={disabled} aria-label={t('coach.referenceFile')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setName(file?.name ?? '');
          onFile(file);
        }} />
      <label htmlFor={id} className="btn ghost">{t('coach.pickFile')}</label>
      <span className="hint">{name || t('coach.noFile')}</span>
    </div>
  </div>;
}
