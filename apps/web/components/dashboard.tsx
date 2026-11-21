"use client";

import { CameraStudio } from "@/components/camera-studio";
import { ImageStudio } from "@/components/image-studio";

const primaryNavigation = [
  { label: "Dashboard", icon: "◫", href: "#dashboard", active: true },
  { label: "Image studio", icon: "▧", href: "#image-studio-title" },
  { label: "Animation studio", icon: "◉", href: "#studio" },
];

export function Dashboard() {
  return (
    <main className="app-shell" id="dashboard">
      <aside className="sidebar">
        <a className="brand-lockup" href="#dashboard" aria-label="MotionFace home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-type">motion<span>face</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar">M</span>
          <span className="workspace-copy"><strong>My workspace</strong><small>Local prototype</small></span>
          <span className="workspace-chevron" aria-hidden="true">⌄</span>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <span className="nav-section-label">WORKSPACE</span>
          {primaryNavigation.map((item) => (
            <a className={`nav-item ${item.active ? "nav-active" : ""}`} href={item.href} key={item.label}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.active ? <span className="nav-active-mark" /> : null}
            </a>
          ))}
          <span className="nav-section-label nav-section-spaced">PREFERENCES</span>
          <a className="nav-item nav-muted" href="#virtual-camera" aria-disabled="true" onClick={(event) => event.preventDefault()}><span className="nav-icon" aria-hidden="true">▣</span>Virtual camera<span className="nav-soon">SOON</span></a>
          <a className="nav-item nav-muted" href="#settings" aria-disabled="true" onClick={(event) => event.preventDefault()}><span className="nav-icon" aria-hidden="true">⚙</span>Settings</a>
          <a className="nav-item nav-muted" href="#account" aria-disabled="true" onClick={(event) => event.preventDefault()}><span className="nav-icon" aria-hidden="true">◌</span>Account</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-shield" aria-hidden="true">⌑</span>
            <div><strong>Private by design</strong><p>Photos and camera frames stay on this device.</p></div>
          </div>
          <div className="local-user"><span className="user-avatar">L</span><span><strong>Local session</strong><small>No account connected</small></span><span className="more-dots">···</span></div>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Dashboard</strong></div>
          <div className="topbar-actions"><span className="build-badge"><span className="status-dot active" /> PROTOTYPE</span><button className="help-button" type="button" aria-label="About this prototype" title="This local prototype does not yet connect to video calling apps">?</button></div>
        </header>
        <div className="page-content">
          <section className="page-intro">
            <div>
              <p className="eyebrow intro-eyebrow">MOTIONFACE WORKSPACE <span>·</span> PHASE 1</p>
              <h1>Good afternoon<span className="intro-period">.</span></h1>
              <p className="intro-copy">Set up a character and see how your movement translates in real time.</p>
            </div>
            <div className="intro-side-note"><span className="intro-line" /><span>First milestone<br /><strong>Local tracking + 3D preview</strong></span></div>
          </section>
          <div className="workspace-grid">
            <CameraStudio />
            <ImageStudio />
          </div>
          <footer className="page-footer"><span>MotionFace prototype <span className="footer-dot">·</span> Browser camera workflow</span><span>Single-photo 3D reconstruction is not included</span></footer>
        </div>
      </div>
    </main>
  );
}
