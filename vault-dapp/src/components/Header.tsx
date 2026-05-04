import { useLocation, Link } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import viteLogo from '/favicon.svg';

export default function Header() {
  const { pathname } = useLocation();

  return (
    <header className="header">
      <div className="header__inner">
        {/* Logo */}
        <Link to="/" className="header__logo">
          <img src={viteLogo} alt="CPE logo" />
          <span>ConfidentialVault</span>
          <span className="dim">/ CPE Demo</span>
        </Link>

        {/* Nav */}
        <nav className="header__nav">
          <Link
            to="/"
            className={`nav-link${pathname === '/' ? ' active' : ''}`}
          >
            CPE
          </Link>
          <Link
            to="/vault"
            className={`nav-link${pathname === '/vault' ? ' active' : ''}`}
          >
            Vault
          </Link>
          <a
            href="https://github.com/the3rdweblabs/CPE"
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            GitHub ↗
          </a>
        </nav>

        {/* Wallet */}
        <div className="header__actions">
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="avatar"
          />
        </div>
      </div>
    </header>
  );
}
