'use client';

interface MonthNavProps {
  month: string; // YYYY-MM
  onChange: (m: string) => void;
}

export default function MonthNav({ month, onChange }: MonthNavProps) {
  const [y, m] = month.split('-').map(Number);

  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1));

  function prev() {
    if (m === 1) {
      onChange(`${y - 1}-12`);
    } else {
      onChange(`${y}-${String(m - 1).padStart(2, '0')}`);
    }
  }

  function next() {
    if (m === 12) {
      onChange(`${y + 1}-01`);
    } else {
      onChange(`${y}-${String(m + 1).padStart(2, '0')}`);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={prev}
        className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
        aria-label="Mês anterior"
      >
        ←
      </button>
      <span className="text-lg font-semibold capitalize">{label}</span>
      <button
        onClick={next}
        className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
        aria-label="Próximo mês"
      >
        →
      </button>
    </div>
  );
}
