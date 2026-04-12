'use client';

import { useState } from 'react';
import type { Transaction } from '@financas/shared';

interface ImportReviewTabsProps {
  sessionId: string;
  newTransactions: Transaction[];
  probableDuplicates: Transaction[];
  ignored: Transaction[];
  onConfirm(decisions: { transactionId: string; action: 'accept' | 'reject' }[]): Promise<void>;
  onCancel(): Promise<void>;
}

type TabId = 'new' | 'duplicates' | 'ignored';

function formatAmount(amount: number, type: string): string {
  const sign = type === 'EXPENSE' ? '-' : '+';
  return `${sign} ${(amount / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })}`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR');
}

function TransactionRow({
  tx,
  action,
  onToggle,
}: {
  tx: Transaction;
  action?: 'accept' | 'reject';
  onToggle?: () => void;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 text-gray-500 text-xs w-24">{formatDate(tx.date)}</td>
      <td className="py-2 text-gray-700 text-sm">{tx.description ?? '—'}</td>
      <td className="py-2 text-right font-mono text-sm text-gray-900">
        {formatAmount(tx.amount, tx.type)}
      </td>
      {onToggle && action && (
        <td className="py-2 text-right w-28">
          <button
            type="button"
            onClick={onToggle}
            className={`px-2 py-1 rounded text-xs font-medium ${
              action === 'accept'
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            {action === 'accept' ? 'Aceitar' : 'Rejeitar'}
          </button>
        </td>
      )}
    </tr>
  );
}

export default function ImportReviewTabs({
  sessionId,
  newTransactions,
  probableDuplicates,
  ignored,
  onConfirm,
  onCancel,
}: ImportReviewTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('new');
  const [duplicateActions, setDuplicateActions] = useState<Record<string, 'accept' | 'reject'>>(
    () =>
      Object.fromEntries(probableDuplicates.map((tx) => [tx.id, 'accept' as const])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleDuplicate(id: string) {
    setDuplicateActions((prev) => ({
      ...prev,
      [id]: prev[id] === 'accept' ? 'reject' : 'accept',
    }));
  }

  async function handleConfirm() {
    setLoading(true);
    setError('');
    try {
      const decisions: { transactionId: string; action: 'accept' | 'reject' }[] = [
        ...newTransactions.map((tx) => ({ transactionId: tx.id, action: 'accept' as const })),
        ...probableDuplicates.map((tx) => ({
          transactionId: tx.id,
          action: duplicateActions[tx.id] ?? 'accept',
        })),
      ];
      await onConfirm(decisions);
    } catch {
      setError('Erro ao confirmar importação.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    setLoading(true);
    setError('');
    try {
      await onCancel();
    } catch {
      setError('Erro ao cancelar importação.');
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: TabId; label: string; count: number; color: string }[] = [
    { id: 'new', label: 'Novas', count: newTransactions.length, color: 'green' },
    { id: 'duplicates', label: 'Prováveis duplicatas', count: probableDuplicates.length, color: 'yellow' },
    { id: 'ignored', label: 'Ignoradas', count: ignored.length, color: 'gray' },
  ];

  const tabColorMap: Record<string, string> = {
    green: 'border-green-500 text-green-700',
    yellow: 'border-yellow-500 text-yellow-700',
    gray: 'border-gray-400 text-gray-600',
  };
  const tabInactiveColorMap: Record<string, string> = {
    green: 'text-gray-500 hover:text-green-600',
    yellow: 'text-gray-500 hover:text-yellow-600',
    gray: 'text-gray-500 hover:text-gray-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* Tab bar */}
      <div className="flex gap-4 border-b mb-4">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? `border-b-2 ${tabColorMap[tab.color]}`
                  : `border-transparent ${tabInactiveColorMap[tab.color]}`
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === 'new' && (
          <table className="w-full text-sm">
            <tbody>
              {newTransactions.length === 0 ? (
                <tr>
                  <td className="py-4 text-gray-400 text-sm">Nenhuma transação nova.</td>
                </tr>
              ) : (
                newTransactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
              )}
            </tbody>
          </table>
        )}
        {activeTab === 'duplicates' && (
          <table className="w-full text-sm">
            <tbody>
              {probableDuplicates.length === 0 ? (
                <tr>
                  <td className="py-4 text-gray-400 text-sm">Nenhuma provável duplicata.</td>
                </tr>
              ) : (
                probableDuplicates.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    action={duplicateActions[tx.id]}
                    onToggle={() => toggleDuplicate(tx.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
        {activeTab === 'ignored' && (
          <table className="w-full text-sm">
            <tbody>
              {ignored.length === 0 ? (
                <tr>
                  <td className="py-4 text-gray-400 text-sm">Nenhuma transação ignorada.</td>
                </tr>
              ) : (
                ignored.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
              )}
            </tbody>
          </table>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2 justify-end mt-4 border-t pt-4">
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="px-4 py-2 rounded border hover:bg-gray-100 disabled:opacity-50 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? 'Aguarde...' : 'Confirmar importação'}
        </button>
      </div>
    </div>
  );
}
