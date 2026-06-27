import React from 'react';
import InstructionDrawer from "./InstructionDrawer.jsx";
import Sidebar from "./Sidebar.jsx";

export default function Layout({
  activePage,
  onNavigate,
  title,
  subtitle,
  instructions,
  guideOpenSignal,
  children,
}) {
  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <main className={activePage === 'home' ? 'main-area home-main-area' : 'main-area'}>
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="future-actions" id="topbar-actions" />
        </header>
        <div className="page-content">{children}</div>
      </main>
      <InstructionDrawer {...instructions} openSignal={guideOpenSignal} />
    </div>
  );
}
