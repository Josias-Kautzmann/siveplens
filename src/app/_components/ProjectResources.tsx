const REPOSITORY = "https://github.com/Josias-Kautzmann/siveplens";

const resources = [
  { label: "Código-fonte", href: REPOSITORY },
  { label: "ETL e execução local", href: `${REPOSITORY}/tree/main/etl-python` },
  { label: "Reprodução dos estudos", href: `${REPOSITORY}/tree/main/research` },
];

export default function ProjectResources() {
  return (
    <section aria-label="Código e reprodução" className="my-6 rounded-2xl border border-[#c5ddd6] bg-white p-5">
      <h2 className="text-sm font-bold text-[#173d32]">Código e reprodução</h2>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        Consulte o código da plataforma, o preparo dos dados e as instruções para executar as análises em ambiente próprio.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {resources.map(({ label, href }) => (
          <a key={href} href={href} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#245c49] underline underline-offset-4">
            {label}
          </a>
        ))}
      </div>
    </section>
  );
}
