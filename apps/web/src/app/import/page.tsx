'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import ImportReviewTabs from '@/components/ImportReviewTabs';
import type { Account, Transaction } from '@financas/shared';

interface ImportSession {
  sessionId: string;
  new: Transaction[];
  probableDuplicates: Transaction[];
  ignored: Transaction[];
}

export default function ImportPage() {
  const router = useRouter();
  const { accessToken, isLoading, login } = useAuth();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [session, setSession] = useState<ImportSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getToken = () => accessToken;

  const client = useMemo(
    () => ({
      fetch: (path: string, opts: RequestInit) =>
        apiFetch(path, opts, () => accessToken, login),
    }),
    [accessToken, login],
  );

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    }
  }, [isLoading, accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    client
      .fetch('/api/accounts', { method: 'GET' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Account[]) => setAccounts(data))
      .catch(() => {});
  }, [accessToken, client]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!accessToken) return null;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !accountId) return;

    setUploading(true);
    setUploadError('');

    try {
      const form = new FormData();
      form.append('accountId', accountId);
      form.append('file', file);

      // Do NOT set Content-Type — browser sets multipart/form-data with boundary automatically
      const res = await apiFetch(
        '/api/transactions/import',
        { method: 'POST', body: form },
        getToken,
        login,
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError((data as { message?: string }).message ?? 'Erro ao importar arquivo.');
        return;
      }

      const data = await res.json();
      // API returns { sessionId, new: [...], probableDuplicates: [...], ignored: [...] }
      setSession({
        sessionId: data.sessionId,
        new: data.new ?? [],
        probableDuplicates: data.probableDuplicates ?? [],
        ignored: data.ignored ?? [],
      });
    } catch {
      setUploadError('Erro de rede.');
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm(
    decisions: { transactionId: string; action: 'accept' | 'reject' }[],
  ) {
    if (!session) return;
    const res = await apiFetch(
      `/api/transactions/import/${session.sessionId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ decisions }),
        headers: { 'Content-Type': 'application/json' },
      },
      getToken,
      login,
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? 'Erro ao confirmar.');
    }

    router.push('/');
  }

  async function handleCancel() {
    if (!session) return;
    await apiFetch(
      `/api/transactions/import/${session.sessionId}`,
      { method: 'DELETE' },
      getToken,
      login,
    );
    router.push('/');
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Importar extrato</h1>
        </div>

        {!session ? (
          /* Phase 1: Upload form */
          <div className="bg-white rounded-lg shadow p-6">
            <form onSubmit={handleUpload} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Conta</label>
                <select
                  required
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione uma conta...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Arquivo CSV (Nubank)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="px-4 py-2 rounded border hover:bg-gray-100 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading || !accountId || !file}
                  className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  {uploading ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Phase 2: Review tabs */
          <ImportReviewTabs
            sessionId={session.sessionId}
            newTransactions={session.new}
            probableDuplicates={session.probableDuplicates}
            ignored={session.ignored}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
      </div>
    </main>
  );
}
