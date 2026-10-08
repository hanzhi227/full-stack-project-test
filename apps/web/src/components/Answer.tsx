import React from 'react';
import type { AskResponse, Citation } from '@document-qa/contracts';
import type { ConversationTurn } from './workspace-state';
import { answerStatusLabels } from './workspace-state';

function readingName(documentName: string) {
  const stripped = documentName.replace(/\.(pdf|txt|md)$/i, '').trim();
  return stripped || documentName;
}

function sourceGroups(citations: Citation[]) {
  const groups: { documentId: string; documentName: string; items: { citation: Citation; number: number }[] }[] = [];
  citations.forEach((citation, index) => {
    const current = groups.find(group => group.documentId === citation.documentId);
    const item = { citation, number: index + 1 };
    if (current) current.items.push(item);
    else groups.push({ documentId: citation.documentId, documentName: citation.documentName, items: [item] });
  });
  return groups;
}

function StatusIcon({ status }: { status: AskResponse['status'] }) {
  const props = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  if (status === 'answered') return <svg {...props}><path d="M5 12.5 9.5 17 19 7.5" /></svg>;
  if (status === 'needs_clarification') {
    return (
      <svg {...props}>
        <path d="M9.4 9.1a2.7 2.7 0 1 1 3.5 2.5c-.8.4-1.2 1-1.2 1.9V14.2" />
        <path d="M12 17.6h.01" />
      </svg>
    );
  }
  if (status === 'insufficient_evidence') return <svg {...props}><path d="M8 12h8" /></svg>;
  return <svg {...props}><path d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5" /></svg>;
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4.5h7l4 4V19.5H7z" />
      <path d="M14 4.5V9h4.5" />
    </svg>
  );
}

function PassageName({ documentName }: { documentName: string }) {
  const friendly = readingName(documentName);
  if (friendly === documentName) return <span>{documentName}</span>;
  return (
    <>
      <span aria-hidden="true">{friendly}</span>
      <span className="sr-only">{documentName}</span>
    </>
  );
}

export function Answer({ turn }: { turn: ConversationTurn }) {
  const { response } = turn;
  const disclosureName = `sources-${response.requestId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const settled = response.status === 'answered';
  return (
    <article className="answer-card" aria-label={`Answer to: ${turn.question}`}>
      <header className="answer-card__head">
        <span className={`answer-mark answer-mark--${response.status}`} aria-hidden="true">
          <StatusIcon status={response.status} />
        </span>
        <div className="answer-card__title">
          <h3 className="asked-question">{turn.question}</h3>
          <p className={settled ? 'sr-only' : `answer-note answer-note--${response.status}`}>
            {answerStatusLabels[response.status]}
          </p>
        </div>
      </header>
      <div className="answer-card__body">
        <p className="answer-text">{response.answer}</p>
        {response.citations.length > 0 && (
          <div className="answer-passages" role="group" aria-label="Sources">
            {sourceGroups(response.citations).map(group => (
              <div className="passage-set" key={group.documentId}>
                <details className="source" name={disclosureName}>
                  <summary>
                    <DocumentIcon />
                    <span className="passage-cue"><PassageName documentName={group.documentName} /></span>
                    {group.items.length > 1 && (
                      <span className="passage-count">{group.items.length} passages</span>
                    )}
                  </summary>
                  {group.items.map(({ citation, number }) => (
                    <blockquote key={citation.id} aria-label={`Source ${number}: exact excerpt`}>
                      {citation.excerpt}
                    </blockquote>
                  ))}
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
