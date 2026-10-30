import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Schema — commercial project agent',
  description: 'An autonomous commercial fit-out workspace with clear decisions, verified evidence, and reviewed handoffs.',
};
export default function RootLayout({children}:{children:React.ReactNode}) {
 return <html lang="en"><body>{children}</body></html>;
}
