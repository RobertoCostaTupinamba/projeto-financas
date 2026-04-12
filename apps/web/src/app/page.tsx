'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import MonthNav from '@/components/MonthNav';
import CreateAccountModal from '@/components/CreateAccountModal';
import CreateCategoryModal from '@/components/CreateCategoryModal';
import CreateTransactionModal from '@/components/CreateTransactionModal';
import type { Account, Category } from '@financas/shared';

export default function Home() {
  const router = useRouter();
  const { accessToken, isLoading, login } = useAuth();

  const [month, setMonth] = useState<string>(
    () => new Date().toLocaleDateString('en-CA').slice(0, 7),
  );
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  const client = useMemo(
    () => ({
      fetch: (path: string, opts: RequestInit) =>
        apiFetch(path, opts, () => accessToken, login),
    }),
    [accessToken, login],
  );

  async function fetchData() {
    if (!accessToken) return;
    try {
      const [accountsRes, categoriesRes, summaryRes] = await Promise.all([
        client.fetch('/api/accounts', { method: 'GET' }),
        client.fetch('/api/categories', { method: 'GET' }),
        client.fetch(`/api/transactions/summary?month=${month}`, {
          method: 'GET',
        }),
      ]);

      if (accountsRes.ok) setAccounts(await accountsRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } catch (err) {
      console.error('fetchData error:', err);
    }
  }

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    }
  }, [isLoading, accessToken, router]);

  useEffect(() => {
    if (accessToken) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, month]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!accessToken) {
    return null;
  }

  const getToken = () => accessToken;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Finanças Pessoais
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAccountModal(true)}
              className="px-3 py-1.5 text-sm rounded bg-gray-700 text-white hover:bg-gray-800"
            >
              + Conta
            </button>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3 py-1.5 text-sm rounded bg-gray-700 text-white hover:bg-gray-800"
            >
              + Categoria
            </button>
            <button
              onClick={() => setShowTransactionModal(true)}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              + Lançamento
            </button>
            <button
              onClick={() => router.push('/import')}
              className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700"
            >
              Importar extrato
            </button>
          </div>
        </div>

        <div className="mb-6">
          <MonthNav month={month} onChange={setMonth} />
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3 text-gray-700">
            Gastos por Categoria
          </h2>
          {Object.keys(summary).length === 0 ? (
            <p className="text-gray-400 text-sm">
              Nenhum lançamento neste mês.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(summary).map(([categoryName, total]) => (
                  <tr key={categoryName} className="border-b last:border-0">
                    <td className="py-2 text-gray-700">{categoryName}</td>
                    <td className="py-2 text-right font-mono text-gray-900">
                      {(total / 100).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateAccountModal
        open={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onSuccess={fetchData}
        getToken={getToken}
        onNewToken={login}
      />
      <CreateCategoryModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onSuccess={fetchData}
        getToken={getToken}
        onNewToken={login}
      />
      <CreateTransactionModal
        open={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        onSuccess={fetchData}
        accounts={accounts}
        categories={categories}
        getToken={getToken}
        onNewToken={login}
      />
    </main>
  );
}
