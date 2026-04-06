import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Footer from './Footer';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="md:ml-64 flex-1 flex flex-col relative min-h-screen overflow-x-hidden">
        <TopBar />
        {/* Canvas — matches stitch <div class="mt-16 p-12 pb-24 space-y-12"> */}
        <div className="mt-16 p-4 pb-24 md:p-12 md:pb-24 space-y-12">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
