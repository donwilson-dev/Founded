import React from 'react';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function InstructionDrawer({ title = 'Instructions', sections = [], tips = [] }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`instruction-drawer ${open ? 'open' : ''}`}>
      <button className="drawer-handle" onClick={() => setOpen((value) => !value)} aria-label="Toggle instructions">
        {open ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <div className="drawer-panel">
        <div className="drawer-title-row">
          <h2>{title}</h2>
          <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close instructions">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-scroll">
          {sections.map((section, index) => (
            <section className="instruction-section" key={`${section.heading}-${index}`}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
          {tips.length > 0 && (
            <section className="tips-box">
              <h3>Tips</h3>
              <ul>
                {tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}
