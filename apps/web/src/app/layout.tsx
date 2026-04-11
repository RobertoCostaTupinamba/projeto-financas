import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata = {
  title: "Financas",
  description: "Personal finance app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
