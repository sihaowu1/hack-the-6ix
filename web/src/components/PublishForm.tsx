import { useState } from 'react';
import { publishToMarketplace } from '../api/client';

export interface PublishFormProps {
  code: string;
  blenderCode: string;
}

export function PublishForm({ code, blenderCode }: PublishFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'publishing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const canPublish = title.trim().length > 0 && code.length > 0 && status !== 'publishing';

  async function handlePublish() {
    setStatus('publishing');
    setErrorMsg('');
    try {
      await publishToMarketplace({ title: title.trim(), description: description.trim(), code, blenderCode });
      setStatus('success');
      setTitle('');
      setDescription('');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message || 'Publish failed');
    }
  }

  if (status === 'success') {
    return <p className="m-0 text-[13px] leading-relaxed text-text-dim">Published! Your scene is now on the Marketplace.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        placeholder="Title (required)"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="resize-y rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        placeholder="Description (optional)"
        maxLength={1000}
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="button" className="btn btn-primary" disabled={!canPublish} onClick={() => void handlePublish()}>
        {status === 'publishing' ? 'Publishing…' : 'Publish'}
      </button>
      {status === 'error' && <p className="m-0 text-[13px] leading-relaxed text-red-400">{errorMsg}</p>}
    </div>
  );
}
