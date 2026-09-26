import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import type { CreateEvaluationInput } from '@crawlops/shared';

/** Create-evaluation form. Minimal fields; validated server-side by Zod. */
export function CreateEvaluationPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [startingUrls, setStartingUrls] = useState('');
  const [strategy, setStrategy] = useState<CreateEvaluationInput['strategy']>('SEARCH');
  const [expectedSchema, setExpectedSchema] = useState('');
  const [maxRetries, setMaxRetries] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      let parsedSchema: Record<string, unknown> | null = null;
      if (expectedSchema.trim()) {
        try {
          parsedSchema = JSON.parse(expectedSchema);
        } catch {
          throw new Error('Expected schema is not valid JSON.');
        }
      }
      const input: CreateEvaluationInput = {
        name,
        taskPrompt,
        startingUrls: startingUrls
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean),
        strategy,
        expectedSchema: parsedSchema,
        maxRetries,
        maxFirecrawlCalls: 5,
        timeoutMs: 30_000,
        minSources: 1,
      };
      await api.createEvaluation(input);
      navigate('/evaluations');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>New Evaluation</h1>
      <p className="subtitle">Define a research task and how it should be evaluated.</p>

      {error && <p className="error">{error}</p>}

      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        <label>Evaluation name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />

        <label>Task / prompt</label>
        <textarea
          rows={3}
          value={taskPrompt}
          onChange={(e) => setTaskPrompt(e.target.value)}
          placeholder="Find the current pricing tiers for Vercel. Return as JSON."
          required
        />

        <label>Starting URLs (optional, one per line)</label>
        <textarea
          rows={2}
          value={startingUrls}
          onChange={(e) => setStartingUrls(e.target.value)}
          placeholder="https://vercel.com/pricing"
        />

        <label>Strategy</label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as CreateEvaluationInput['strategy'])}
        >
          <option value="SEARCH">SEARCH</option>
          <option value="AUTO">AUTO (maps to SEARCH for now)</option>
        </select>

        <label>Expected output schema (optional JSON Schema)</label>
        <textarea
          rows={4}
          value={expectedSchema}
          onChange={(e) => setExpectedSchema(e.target.value)}
          placeholder='{ "type": "object", "required": ["price"] }'
        />

        <label>Maximum retries</label>
        <input
          type="number"
          min={0}
          max={5}
          value={maxRetries}
          onChange={(e) => setMaxRetries(Number(e.target.value))}
        />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Evaluation'}
        </button>
      </form>
    </>
  );
}
