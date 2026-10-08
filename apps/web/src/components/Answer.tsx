import React from 'react';
import type { ConversationTurn } from './workspace-state';
import { answerStatusLabels } from './workspace-state';

export function Answer({ turn }: { turn: ConversationTurn }) {
  const { response } = turn;
  return (
    <article className="conversation-turn" aria-label={`Answer to: ${turn.question}`}>
      <h3 className="asked-question">{turn.question}</h3>
      <p className={`answer-status answer-status--${response.status}`}>
        {answerStatusLabels[response.status]}
      </p>
      <div className="answer-sleeve">
        <p className="answer-sleeve__label">Answer</p>
        <p className="answer-text">{response.answer}</p>
      </div>
      {response.citations.length > 0 && (
        <section className="sources" aria-label="Sources">
          <h4>Sources</h4>
          {response.citations.map((citation, index) => (
            <details className="source" key={citation.id}>
              <summary>
                <span className="source-name">{citation.documentName}</span>
                <span className="source-lines">Lines {citation.startLine}–{citation.endLine}</span>
              </summary>
              <blockquote aria-label={`Source ${index + 1}: exact excerpt`}>{citation.excerpt}</blockquote>
            </details>
          ))}
        </section>
      )}
    </article>
  );
}
