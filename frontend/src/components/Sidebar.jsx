import React from 'react';
import { BarChart3, Home, LineChart, PenTool, WalletCards } from "lucide-react";

const items = [
  { id: "home", label: "Home", icon: Home },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "baseline", label: "Baseline Builder", icon: WalletCards },
  { id: "scenario", label: "Scenario Builder", icon: PenTool },
];

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>Founded</span>
        <LineChart size={22} />
      </div>
      <nav className="nav-list">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`nav-item ${activePage === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">© 2026 donwilsondev</div>
    </aside>
  );
}
