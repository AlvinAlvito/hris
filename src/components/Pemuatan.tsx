export function Pemuatan() {
  return (
    <main className="page-loading" role="status" aria-live="polite" aria-label="Memuat HRIS POSI">
      <div className="loading-card">
        <div className="loading-orbit" aria-hidden="true">
          <span className="loading-orbit-ring ring-a" />
          <span className="loading-orbit-ring ring-b" />
          <span className="loading-core"><img src="/emblem-posi.png" alt="" /></span>
          <i className="loading-spark spark-a" /><i className="loading-spark spark-b" />
        </div>
        <div className="loading-brand">HRIS <b>POSI</b></div>
        <div className="loading-caption">Menyiapkan ruang kerja Anda</div>
        <div className="loading-track"><i /></div>
        <div className="loading-dots" aria-hidden="true"><i /><i /><i /></div>
      </div>
    </main>
  );
}
