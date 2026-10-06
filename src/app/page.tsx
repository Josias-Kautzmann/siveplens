import Link from "next/link";
import styles from "./landing.module.css";

export default function LandingPage() {
  return (
    <section className={styles.hero}>
      {/* Vídeo de fundo */}
      <video
        className={styles.bgVideo}
        autoPlay loop muted playsInline
        src="/home_hero.webm"
      />

      {/* Vinheta */}
      <div className={styles.vignette} />

      {/* Navbar */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 16 16">
              <circle cx="4"  cy="4"  r="2" />
              <circle cx="12" cy="4"  r="2" />
              <circle cx="4"  cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <line x1="4" y1="4" x2="12" y2="12" stroke="#c2e8df" strokeWidth="1.2" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="#c2e8df" strokeWidth="1.2" />
            </svg>
          </div>
          SivepLens
        </Link>
        <div className={styles.navRight}>
          <ul className={styles.navLinks}>
            <li><Link href="/painel">Painel</Link></li>
            <li><Link href="/analise">Análise</Link></li>
            <li><Link href="/docs">Documentação</Link></li>
            <li><Link href="/conectar">Conectar via Claude</Link></li>
            <li><Link href="/noticias?tab=artigos">Artigos</Link></li>
          </ul>
          <Link
            href="/artigo/eramia-2026"
            className={styles.navEramia}
            aria-label="Abrir artefato científico da ERAMIA-RS 2026"
          >
            <span />
            ERAMIA-RS 2026
          </Link>
        </div>
      </nav>

      {/* Hero body: flex column que elimina conflito de posicionamento */}
      <div className={styles.heroBody}>
        <div className={styles.heroContent}>
          <span className={styles.heroEyebrow}>Hub de Análise · SRAG</span>
          <h1 className={styles.heroTitle}>
            Os dados de<br />
            <strong>SRAG no Brasil</strong><br />
            prontos para análise.
          </h1>
          <p className={styles.heroDesc}>
            Explore os microdados do SIVEP-Gripe com ferramentas estatísticas prontas —
            tabelas de contingência, odds ratios, regressão logística e perfis clínicos.
            Sem planilhas, sem código.
          </p>
          <div className={styles.heroCta}>
            <Link href="/painel"   className={styles.btnPrimary}>Acessar painel</Link>
            <Link href="/conectar" className={styles.btnClaude}>
              <svg className={styles.btnClaudeIcon} viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="4"  cy="4"  r="2" />
                <circle cx="12" cy="4"  r="2" />
                <circle cx="4"  cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <line x1="4" y1="4" x2="12" y2="12" strokeWidth="1.2" />
                <line x1="12" y1="4" x2="4" y2="12" strokeWidth="1.2" />
              </svg>
              Conectar via Claude
            </Link>
            <Link href="/docs"     className={styles.btnSecondary}>Ver metodologia</Link>
          </div>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Registros analisados</div>
            <div className={styles.statValue}>714 mil</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Estados cobertos</div>
            <div className={styles.statValue}>27</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Variáveis analisáveis</div>
            <div className={styles.statValue}>26</div>
          </div>
        </div>
      </div>
    </section>
  );
}
