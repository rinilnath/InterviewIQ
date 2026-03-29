import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function AppShell({ children }) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <motion.main
          className="flex-1 p-6 pb-20 md:pb-6"
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.main>
        <MobileNav />
      </div>
    </div>
  );
}
