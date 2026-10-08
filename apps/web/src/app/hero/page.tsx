import '../scaffold-layout.css';
import './hero.css';

/** Measured first-viewport reproduction for the Impeccable hero gate (1280×720). */
export default function HeroPage() {
  return (
    <main className="comp-frame hero-frame">
      <div className="r-binder-spine hero-spine" data-region="binder-spine" />
      <div className="r-page-top" data-region="page-top" />
      <div className="r-page-bottom" data-region="page-bottom" />
      <div className="r-rail-bottom" data-region="rail-bottom" />

      <div
        className="hero-page-ground"
        style={{ backgroundImage: 'url(/plates/page-grid.png)' }}
        aria-hidden="true"
      />

      <figure className="r-rings hero-rings" data-region="rings">
        <img src="/plates/rings.png" alt="" />
      </figure>

      <div className="r-source-card hero-source-card" data-region="source-card" />

      <div className="r-answer-strip hero-answer" data-region="answer-strip">
        <p>Answer: Submit Form R-12 and receipts within 60 days.</p>
      </div>

      <div className="r-sources-heading hero-sources-heading" data-region="sources-heading">
        <p>Sources</p>
      </div>

      <div className="r-source-meta hero-source-meta" data-region="source-meta">
        <p>03 Reimbursement Guide.pdf Lines 112–128</p>
      </div>

      <div className="r-source-excerpt hero-source-excerpt" data-region="source-excerpt">
        <p>
          Submit the completed Reimbursement Request Form (Form R-12) along with
          itemized receipts and supporting documentation. Requests must be
          submitted within 60 days of the expense.
        </p>
      </div>

      <div className="r-title hero-title" data-region="title">
        <p>Ask your documents.</p>
      </div>

      <div className="r-description hero-description" data-region="description">
        <p>
          Upload a handbook or guide, then ask a question. Answers include
          passages you can check.
        </p>
      </div>

      <div className="r-upload hero-upload" data-region="upload">
        <button type="button">Upload document</button>
      </div>

      <div className="r-doc-heading hero-doc-heading" data-region="doc-heading">
        <p>Document Checklist</p>
      </div>

      <div className="r-documents hero-documents" data-region="documents">
        <ul>
          <li>01 Employee Handbook.pdf</li>
          <li>02 Travel Policy Guide.pdf</li>
          <li className="is-selected">03 Reimbursement Guide.pdf</li>
          <li>04 Code of Conduct.pdf</li>
          <li>05 Safety Handbook.pdf</li>
        </ul>
      </div>

      <div className="r-question-label hero-question-label" data-region="question-label">
        <p>What would you like to know?</p>
      </div>

      <div className="r-question hero-question" data-region="question">
        <textarea
          readOnly
          value="What do I need to do before requesting reimbursement?"
          aria-label="What would you like to know?"
        />
      </div>

      <div className="r-ask hero-ask" data-region="ask">
        <button type="button">Ask</button>
      </div>
    </main>
  );
}
