import { requireViewer } from "@/lib/auth/team";

/** See src/app/(feed)/layout.tsx — a loading.tsx demands a layout-level gate. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireViewer("/yappers");
  return children;
}
