'use client';

import React, { useEffect, useState } from 'react';

const stages = [
  { label: 'Thinking through your question…', delay: 0 },
  { label: 'Fetching relevant sources…', delay: 2500 },
  { label: 'Preparing your answer…', delay: 6500 },
  { label: 'Still working on your answer…', delay: 18000 },
];

export function AnswerProgress({ question }: { question: string }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // shortcut: stages are estimates, replace timers when the API exposes live progress.
    const timers = stages.slice(1).map(({ delay }, index) =>
      window.setTimeout(() => setStage(index + 1), delay));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <article className="answer-card answer-card--pending" aria-busy="true" aria-label={`Working on: ${question}`}>
      <header className="answer-card__head">
        <span className="answer-mark answer-mark--pending" aria-hidden="true">
          <svg className="answer-mark__wait" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="12" cy="12" r="7.25" opacity="0.35" />
            <path d="M12 4.75a7.25 7.25 0 0 1 7.25 7.25" />
          </svg>
        </span>
        <h3 className="asked-question">{question}</h3>
      </header>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        <span key={stage}>{stages[stage].label}</span>
      </p>
      <p className="sr-only">Using your selected documents. Progress shown is approximate.</p>
    </article>
  );
}
