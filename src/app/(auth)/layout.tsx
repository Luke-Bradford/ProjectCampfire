// Auth pages (login, register, forgot-password) share this layout.
// No nav — just a clean centered shell.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
